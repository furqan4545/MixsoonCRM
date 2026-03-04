/**
 * Resolve template variables in email template strings.
 * Supported: {{influencer_name}}, {{influencer_username}}, {{influencer_email}},
 *            {{days_since_last_email}}, {{our_email}}
 */
export function resolveTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    if (val === null || val === undefined) return match;
    return String(val);
  });
}
