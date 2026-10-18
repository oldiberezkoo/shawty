import io

p = 'src/server/services/screen-service.ts'
s = io.open(p, encoding='utf-8', newline='').read()

marker = s.index('function computeOnlineState(')
# Walk back to the start of the preceding doc comment.
comment_start = s.rindex('/**', 0, marker)
# The function body ends right before the next top-level export.
end_marker = s.index('export function listScreens(')
body_end = s.rindex('\n\n', marker, end_marker)

old = s[comment_start:body_end]
print('--- replacing ---')
print(old[:200])
print('...')
print(old[-200:])
print('--- end ---')