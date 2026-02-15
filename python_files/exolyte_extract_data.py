# %%writefile exolyte_extract_data.py
import pandas as pd
from bs4 import BeautifulSoup
import subprocess
import time
import os
import sys
import random 
from datetime import datetime
import customtkinter as ctk
from tkinter import messagebox
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import gspread 

# ======================================================
# [설정] 여기 숫자만 바꾸면 1~8번 세팅이 자동 완료됩니다.
# ======================================================
WORKER_ID = 1  # <--- 이 숫자를 1 ~ 8 사이로 변경하세요.

# ------------------------------------------------------
# [자동 설정] 건드리지 마세요
# ------------------------------------------------------
PORT = 9221 + WORKER_ID 
PROFILE_FOLDER_NAME = f"manual_worker_{WORKER_ID}"

USER_HOME = os.environ.get("USERPROFILE")

DROPBOX_BASE = os.path.join(
    USER_HOME,
    r"(주)파켓 Dropbox\PAKET's Dropbox\★MIXSOON 믹순★\(★) 사용\데이터 분석"
)

PROFILE_PATH = 
JSON_KEY_PATH = 
LOG_SHEET_URL = 


# ======================================================
# [기능 1] 구글 시트 로그 저장
# ======================================================
def save_log(scroll_cnt, raw_count, unique_count, saved_filename):
    print(f"📊 구글 시트 로그 저장을 시도합니다... (Worker {WORKER_ID})")
    
    if not os.path.exists(JSON_KEY_PATH):
        print(f"❌ 인증키 파일을 찾을 수 없습니다: {JSON_KEY_PATH}")
        return

    try:
        gc = gspread.service_account(filename=JSON_KEY_PATH)
        sh = gc.open_by_url(LOG_SHEET_URL)
        worksheet = sh.worksheet("엑솔리트사용로그") 

        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        row_data = [
            current_time,
            f"Worker_{WORKER_ID} ({PORT})",
            scroll_cnt,
            raw_count,
            unique_count,
            saved_filename
        ]

        worksheet.append_row(row_data)
        print(f"✅ 구글 시트 기록 완료! [ {saved_filename} ]")

    except Exception as e:
        print(f"❌ 로그 저장 실패: {e}")


# ======================================================
# [기능 2] 메인 스크래핑 로직
# ======================================================
def run_scraper(scroll_limit):
    print(f"📂 프로필 경로 사용: {PROFILE_PATH}")
    
    if not os.path.exists(PROFILE_PATH):
        try: os.makedirs(PROFILE_PATH)
        except: pass

    # 1. 크롬 실행
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if not os.path.exists(chrome_path):
        chrome_path = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

    cmd = [
        chrome_path,
        f"--user-data-dir={PROFILE_PATH}",
        f"--remote-debugging-port={PORT}",
        "--no-first-run",
        "--disable-gpu",
        "--window-size=1280,900", 
        "https://exolyt.com/videos"
    ]

    print(f"🚀 [Worker {WORKER_ID}] 브라우저 실행 중... (Port: {PORT})")
    subprocess.Popen(cmd)
    
    time.sleep(5)

    try:
        # 2. Selenium 연결
        options = Options()
        options.add_experimental_option("debuggerAddress", f"127.0.0.1:{PORT}")
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        
        print(f"✅ 브라우저 연결 성공!")

        # 3. 사용자 필터 대기
        alert = ctk.CTk()
        alert.title(f"Worker {WORKER_ID} 대기 중")
        
        w, h = 400, 180
        ws, hs = alert.winfo_screenwidth(), alert.winfo_screenheight()
        x, y = (ws/2) - (w/2), 150
        
        alert.geometry('%dx%d+%d+%d' % (w, h, x, y))
        alert.attributes("-topmost", True) 
        
        label = ctk.CTkLabel(alert, text="필터 설정 완료 후 [확인]을 누르세요.", font=("Arial", 14))
        label.pack(pady=30)
        
        btn = ctk.CTkButton(alert, text="확인 (수집 시작)", command=alert.destroy, fg_color="#55C289")
        btn.pack(pady=10)
        
        alert.mainloop()

        print(f"📜 랜덤 스크롤 시작 (목표: {scroll_limit}회)...")

        # 4. 스크롤 로직 (랜덤 + 스마트 웨이트)
        last_height = driver.execute_script("return document.body.scrollHeight")
        total_no_change = 0 

        for i in range(scroll_limit):
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            
            # 랜덤 대기
            time.sleep(random.uniform(1.5, 3.5))
            
            # 스마트 웨이트
            waited_time = 0
            is_loaded = False
            
            while waited_time < 90: 
                time.sleep(1)
                waited_time += 1
                new_height = driver.execute_script("return document.body.scrollHeight")
                if new_height != last_height:
                    is_loaded = True
                    last_height = new_height
                    break 
            
            if is_loaded:
                total_no_change = 0 
            else:
                total_no_change += 1
                if total_no_change >= 3:
                    print(f"🛑 {int(waited_time * total_no_change)}초 동안 로딩되지 않아 종료합니다.")
                    break
            
            if (i+1) % 10 == 0:
                print(f"   ⬇️ {i+1}/{scroll_limit}회 완료...")

        # 5. 데이터 추출
        print("\n🔍 데이터 추출 및 분석 중...")
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        
        items = soup.select(".mt-2.flex.gap-1.flex-wrap.items-center.font-bold.w-full .video--shadow")
        
        raw_usernames = []
        for item in items:
            txt = item.text.strip().lstrip('@')
            if txt: raw_usernames.append(txt)
        
        raw_count = len(raw_usernames)
        unique_usernames = list(set(raw_usernames))
        unique_count = len(unique_usernames)
        duplicate_count = raw_count - unique_count # 중복 개수 계산
        
        # 콘솔 출력
        print("\n" + "="*50)
        print(f"📊 [수집 결과 요약 - Worker {WORKER_ID}]")
        print(f"   - 총 수집된 데이터 : {raw_count} 개")
        print(f"   - 중복 제거 후     : {unique_count} 개 ({duplicate_count}개 중복 삭제됨)")
        print("="*50)

        # 6. CSV 저장
        if unique_usernames:
            print(f"💾 엑셀(CSV) 파일 저장을 시작합니다...")
            
            filename = f"Result_Worker_{WORKER_ID}_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
            save_path = os.path.join(os.path.expanduser("~"), "Downloads", filename)
            
            df = pd.DataFrame(unique_usernames, columns=['Username'])
            df.to_csv(save_path, index=False, encoding='utf-8-sig')
            
            print(f"🎉 저장 완료! 경로: {save_path}")
            print("-" * 50)
            
            # 7. 구글 시트 로그 저장
            save_log(scroll_limit, raw_count, unique_count, filename)
            
            # [수정됨] 8. 메시지 박스에 상세 결과 출력
            result_msg = (
                f"📊 [수집 결과 요약 - Worker {WORKER_ID}]\n\n"
                f"   - 총 수집된 데이터 : {raw_count} 개\n"
                f"   - 중복 제거 후     : {unique_count} 개 ({duplicate_count}개 삭제됨)\n\n"
                f"💾 파일명: {filename}"
            )
            messagebox.showinfo("수집 완료", result_msg)
            
        else:
            print("❌ 수집된 데이터가 0개입니다. 저장을 건너뜁니다.")
            save_log(scroll_limit, 0, 0, "데이터 없음")
            messagebox.showwarning("실패", "수집된 데이터가 없습니다.")

    except Exception as e:
        messagebox.showerror("에러", f"오류 발생: {e}")

# ======================================================
# GUI
# ======================================================
def main_gui():
    ctk.set_appearance_mode("Light")
    ctk.set_default_color_theme("green")
    
    app = ctk.CTk()
    app.title(f"Worker {WORKER_ID}")
    app.geometry('300x200')

    def on_start():
        try:
            limit = int(entry_scroll.get())
            app.destroy()
            run_scraper(limit)
        except ValueError:
            messagebox.showerror("오류", "숫자만 입력하세요.")

    ctk.CTkLabel(app, text=f"Worker {WORKER_ID} 수집기", font=("Arial", 20, "bold")).pack(pady=20)
    
    entry_scroll = ctk.CTkEntry(app, placeholder_text="스크롤 횟수 (예: 300)")
    entry_scroll.pack(pady=10)
    
    ctk.CTkButton(app, text="브라우저 열기", command=on_start).pack(pady=10)
    
    app.mainloop()

if __name__ == "__main__":
    main_gui()