import io

p = 'README.md'
s = io.open(p, encoding='utf-8', newline='').read()

s = s.replace('# 282 теста', '# 300 тестов')
s = s.replace('# 282 тест', '# 300 тестов')

io.open(p, 'w', encoding='utf-8', newline='').write(s)

for line in s.splitlines():
    if '300' in line or '282' in line:
        print(line)