
import logging
import pandas as pd
import os
import sys
from datetime import datetime
from apify_client import ApifyClient
import time
import re
import numpy as np

# =========================================================
# 0. [핵심] 리소스 경로 및 설정
# =========================================================

# 1. Apify API 키 (환경변수에서 로드)
APIFY_API_KEY = os.environ.get("APIFY_API_KEY", "")

# 2. CSV 입력 및 출력 설정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_INPUT_PATH = os.path.join(BASE_DIR, "csv_data", "Result_Worker_1_20260128_1133.csv")
USERNAME_COLUMN = "Username"
USERNAME_LIMIT = 50  # -1이면 전체, 50이면 50명만 수집

OUTPUT_DIR = os.path.join(BASE_DIR, "output")
OUTPUT_FILENAME = "output.xlsx"

# 3. 수집 옵션
TARGET_VIDEO_COUNT = 20

# =========================================================
# 2. 메인 실행 로직
# =========================================================

print("⏳ 설정을 시작합니다...")

# Apify 설정 (코드 내장)
client = ApifyClient(APIFY_API_KEY)
print(f"🔑 API Key 설정 완료")

try:
    df = pd.read_csv(CSV_INPUT_PATH, encoding="utf-8-sig")
except Exception as e:
    print(f"❌ CSV 읽기 실패:\n{e}")
    sys.exit(1)

if USERNAME_COLUMN not in df.columns:
    print(f"❌ CSV에 '{USERNAME_COLUMN}' 컬럼이 없습니다.")
    sys.exit(1)

df1 = df

# ---------------------------------------------------------
# APIFY 수집 로직
# ---------------------------------------------------------

raw_profiles = df1[USERNAME_COLUMN].dropna().astype(str).tolist()

all_profiles = list(dict.fromkeys(raw_profiles))

if USERNAME_LIMIT != -1:
    all_profiles = all_profiles[:USERNAME_LIMIT]

print(f"ℹ️ 입력: {len(raw_profiles)}명 -> 수집 대상: {len(all_profiles)}명")

all_results = []
BATCH_SIZE = 100

print(f" 데이터 수집을 시작합니다... (총 {len(all_profiles)}명)")

for i in range(0, len(all_profiles), BATCH_SIZE):
    batch = all_profiles[i : i + BATCH_SIZE]
    current_batch_num = i // BATCH_SIZE + 1
    
    total_max_items = len(batch) * TARGET_VIDEO_COUNT 

    batch_start_time = time.time()
    print(f"\n🚀 [{current_batch_num}회차] {len(batch)}명 ( {batch[0]} ... ) 분석 시작")

    run_input = {
        "maxItems": total_max_items + 300,
        "usernames": batch,
        "resultsPerPage": TARGET_VIDEO_COUNT
    }

    actor_run = client.actor("ssOXktOBaQQiYfhc4").start(run_input=run_input)
    run_id = actor_run["id"]
    
    print(f"    ⏳ 데이터 수집 진행 중...")
    run_finished = client.run(run_id).wait_for_finish()
    
    dataset_id = run_finished["defaultDatasetId"]
    current_items = list(client.dataset(dataset_id).iterate_items())
    
    all_results.extend(current_items)

    batch_end_time = time.time()
    elapsed_time = batch_end_time - batch_start_time
    print(f"✅ [{current_batch_num}회차] 완료! {len(current_items)}개 데이터 확보.")

print(f"🎉 수집 종료. 총 {len(all_results)}개 데이터.")

# 1. 원본 명단 준비 (기준점)
original_df = pd.DataFrame({'name': all_profiles})
original_df['merge_key'] = original_df['name'].astype(str).str.lower().str.strip()

if all_results:
    final_df = pd.DataFrame(all_results)
    
    def safe_extract(df, col, key):
        if col in df.columns:
            return df[col].apply(lambda x: x.get(key) if isinstance(x, dict) else None)
        return None

    # -- [1] 프로필 데이터 추출 --
    final_df['name_extracted'] = safe_extract(final_df, 'channel', 'username')
    final_df['name_origin'] = final_df['name_extracted'].fillna("Unknown")
    
    final_df['merge_key'] = final_df['name_origin'].astype(str).str.lower().str.strip()
    
    if 'uploadedAtFormatted' in final_df.columns:
        final_df = final_df.sort_values(by=['merge_key', 'uploadedAtFormatted'], ascending=[True, False])
    
    final_df = final_df.groupby('merge_key').head(TARGET_VIDEO_COUNT)

    # -- [2] 프로필 정보 집계 --
    final_df['profile_url'] = safe_extract(final_df, 'channel', 'url')
    final_df['biolink']     = safe_extract(final_df, 'channel', 'bio')
    final_df['fans']        = safe_extract(final_df, 'channel', 'followers')

    profile_agg = final_df.groupby('merge_key', as_index=False).agg(
        profile_url=('profile_url', 'first'),
        biolink=('biolink', 'first'),
        fans=('fans', 'max')
    )

    # -- [3] 영상 통계 집계 --
    if 'views' in final_df.columns and 'bookmarks' in final_df.columns:
        video_agg = final_df.groupby('merge_key', as_index=False).agg(
            play_median=('views', 'median'),
            collect_median=('bookmarks', 'median'),
            signature=('title', 'first'), 
            last_post_date=('uploadedAtFormatted', 'max')
        )
    else:
        video_agg = pd.DataFrame(columns=['merge_key', 'play_median', 'collect_median', 'signature', 'last_post_date'])

    # -- [4] 이미지 추출 --
    if 'video' in final_df.columns:
        final_df['thumbnail'] = safe_extract(final_df, 'video', 'cover')
        image_df = final_df.groupby('merge_key')['thumbnail'].apply(lambda x: pd.Series(x.values)).unstack()
        image_df.columns = [f'image_{i+1}' for i in image_df.columns]
        image_df = image_df.reset_index()
    else:
        image_df = pd.DataFrame(columns=['merge_key'])

    # -- [5] 병합 --
    step1 = pd.merge(profile_agg, video_agg, on='merge_key', how='left')
    scraped_result = pd.merge(step1, image_df, on='merge_key', how='left')

    def extract_email_from_text(text):
        if not isinstance(text, str): return ""
        match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        return match.group(0) if match else ""

    print("⚡ 이메일 추출 중...")
    scraped_result['email'] = scraped_result['biolink'].apply(extract_email_from_text)

else:
    print("⚠️ 수집된 데이터가 없습니다. 빈 값으로 채웁니다.")
    scraped_result = pd.DataFrame(columns=['merge_key'])

# 3. [최종 병합]
final_complete_df = pd.merge(original_df, scraped_result, on='merge_key', how='left')
final_complete_df = final_complete_df.drop(columns=['merge_key'])
final_complete_df = final_complete_df.fillna("NA")

# 4. 열 순서 및 업로드
fixed_cols = ['name', 'profile_url', 'signature', 'biolink', 'fans', 'play_median','collect_median', 'last_post_date', 'email']
image_cols = [f'image_{i}' for i in range(1, TARGET_VIDEO_COUNT + 1)]
target_order = fixed_cols + image_cols

final_cols = [c for c in target_order if c in final_complete_df.columns]
final_complete_df = final_complete_df[final_cols]

os.makedirs(OUTPUT_DIR, exist_ok=True)
output_path = os.path.join(OUTPUT_DIR, OUTPUT_FILENAME)
try:
    final_complete_df.to_excel(output_path, index=False)
    print(f"🎉 모든 작업 완료! 저장 위치: {output_path}")
except Exception as e:
    print(f"❌ 엑셀 저장 실패: {e}")

