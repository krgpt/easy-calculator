# AI 음식 칼로리 스캐너 — 서버(프록시) 설정 가이드

`016-음식 칼로리 계산기.html`은 **Cloudflare Worker**를 통해 Google Gemini API를 호출합니다.
Gemini API 키는 Worker의 **Secret**에만 저장되므로, 웹사이트 방문자는 키를 볼 수 없고
자신의 키를 입력할 필요도 없습니다.

```
[iPhone Safari/Chrome]
        │  사진(base64) 전송
        ▼
[Cloudflare Worker]  ← GEMINI_API_KEY (Secret, 외부 노출 없음)
        │  Gemini API 호출
        ▼
[Google Gemini API]
        │  분석 결과(JSON)
        ▼
[웹페이지] 칼로리/영양소 표시
```

> ⚠️ **가장 중요한 원칙**
> API 키를 HTML, JavaScript, GitHub 저장소에 넣으면 **절대** 숨길 수 없습니다.
> 브라우저 개발자 도구로 누구나 볼 수 있기 때문입니다.
> 반드시 이 가이드처럼 **서버(Worker) 쪽에 키를 두고** 웹페이지는 Worker 주소만 호출해야 합니다.

---

## 1. Gemini API 키 발급

1. <https://aistudio.google.com/apikey> 접속 (Google 계정 로그인)
2. **Create API key** 클릭
3. 프로젝트를 선택하고 키를 복사합니다. (`AIza...`로 시작)
4. 이 키는 **아무에게도 보내지 말고**, 아래 Worker Secret에만 붙여넣습니다.

> 무료 등급으로도 사용할 수 있지만, 사용량이 많아지면 결제 계정 연결이 필요할 수 있습니다.
> Google Cloud Console → 결제 → 예산 알림을 설정해 두면 예상치 못한 과금을 막을 수 있습니다.
>
> Google Cloud Console의 **APIs & Services → Library**에서 **Generative Language API**가
> 사용 설정(Enable)되어 있는지도 확인하세요. AI Studio에서 만든 키는 보통 자동으로 설정되어 있습니다.

---

## 2. Cloudflare Worker 배포 (권장: 웹 대시보드, 설치 불필요)

### 2-1. Worker 만들기

1. <https://dash.cloudflare.com> 가입/로그인 (무료, 카드 등록 불필요)
2. 왼쪽 메뉴 **Workers & Pages** → **Create** → **Worker** → **Create Worker**
3. 이름을 입력합니다. 예: `easy-calculator-gemini`
4. **Deploy** 클릭
5. **Edit code** (또는 Quick Edit)를 열고, 기본 코드를 모두 지운 뒤
   이 폴더의 `gemini-proxy.js` 내용을 **전부 복사해서 붙여넣기** 합니다.
6. 오른쪽 위 **Deploy** 클릭

### 2-2. API 키를 Secret으로 등록

1. Worker 화면에서 **Settings** → **Variables and Secrets**
2. **Add** 클릭
3. Name: `GEMINI_API_KEY`
4. Value: 1단계에서 복사한 Gemini API 키
5. Type: **Secret** 선택 → **Save**

> `GEMINI_API_KEY`는 Secret으로 저장해야 대시보드에서도 값이 가려지고, 코드에도 남지 않습니다.

### 2-3. Worker 주소 확인

Worker 개요 화면에 표시되는 주소를 복사합니다.

```
https://easy-calculator-gemini.<내-서브도메인>.workers.dev
```

브라우저에서 이 주소를 열었을 때 `POST 요청만 지원합니다.` 같은 JSON이 보이면 정상 배포된 것입니다.

---

## 3. HTML 파일에 Worker 주소 넣기

`016-음식 칼로리 계산기.html`을 열고 아래 부분을 찾습니다.

```js
const API_ENDPOINT = "https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev/";
```

2-3에서 복사한 주소로 바꿉니다.

```js
const API_ENDPOINT = "https://easy-calculator-gemini.myid.workers.dev/";
```

> 주소 끝의 `/`는 있어도 되고 없어도 됩니다.
> **Gemini API 키는 이 파일에 절대 넣지 마세요.**

---

## 4. GitHub에 올리고 아이폰으로 테스트

> 현재 GitHub에 올라가 있는 `016-음식 칼로리 계산기.html`은 **중간에 잘린 미완성 파일**입니다.
> 아래 방법으로 새 파일로 **교체**해야 합니다. (`index.html`은 이미 016을 링크하고 있으므로 수정할 필요 없습니다.)

### 방법 A — GitHub 웹사이트에서 교체 (가장 간단)

1. <https://github.com/krgpt/easy-calculator> 접속
2. `cal house` 폴더 → `016-음식 칼로리 계산기.html` 클릭
3. 오른쪽 위 **연필(Edit)** 로 새 내용을 붙여넣거나, **Upload files**로 새 파일을 업로드
4. **Commit changes** 클릭
5. 1~2분 후 아래 주소에서 확인

`worker` 폴더는 Cloudflare에 배포하는 용도라 GitHub에 올리지 않아도 됩니다. (올려도 비밀 키는 포함되지 않습니다.)

### 방법 B — Git 명령어

현재 로컬 저장소가 GitHub보다 뒤처져 있으므로, 아래 순서로 안전하게 맞춘 뒤 올립니다.

```powershell
cd "C:\ZZ-Nathan Work\AI\AI-Ring\living cal"
git fetch origin
git reset --mixed origin/main
git add "cal house/016-음식 칼로리 계산기.html"
# worker 폴더도 함께 올리려면: git add "worker"
git commit -m "Replace AI food calorie scanner with secure Gemini proxy"
git push origin main
```

> `git reset --mixed origin/main`은 **작업 파일은 그대로 두고** 로컬 브랜치만 GitHub 최신 상태로 맞춥니다.
> 기존 `index.html`, `012` 파일은 GitHub 최신 내용과 동일하므로 함께 커밋되지 않습니다.

GitHub Pages 반영에는 보통 1~2분 걸립니다.

- 사이트: <https://krgpt.github.io/easy-calculator/>
- 계산기 직접 주소: <https://krgpt.github.io/easy-calculator/cal%20house/016-%EC%9D%8C%EC%8B%9D%20%EC%B9%BC%EB%A1%9C%EB%A6%AC%20%EA%B3%84%EC%82%B0%EA%B8%B0.html>

아이폰에서 **Safari**로 열고, `음식 칼로리 보기` → `AI 카메라 음식물 칼로리 계산기`를 눌러 테스트합니다.

> GitHub Pages는 HTTPS라서 카메라 권한이 정상적으로 동작합니다.
> 로컬 PC에서 `file://`로 열면 카메라가 막힐 수 있으니, 테스트는 GitHub Pages 주소에서 하세요.

---

## 5. Safari vs Chrome (아이폰)

| 항목 | Safari | Chrome (iOS) |
|---|---|---|
| 카메라(getUserMedia) | ✅ 잘 동작 | ✅ 동작 |
| 엔진 | WebKit | WebKit (사실상 Safari와 동일) |
| 추천도 | ⭐ **가장 안정적** | 사용 가능 |

- **아이폰에서는 Safari를 권장합니다.** iOS는 모든 브라우저가 WebKit을 쓰기 때문에 Chrome도 동작하지만,
  카메라 권한·홈화면 추가(PWA) 등은 Safari가 가장 예측 가능합니다.
- **카카오톡, 인스타그램, 네이버, 페이스북, 라인 등 앱 안의 브라우저**는 카메라를 막는 경우가 많습니다.
  반드시 **Safari 또는 Chrome 앱으로 직접 열어** 주세요.
- 안드로이드는 Chrome 권장, PC는 Chrome/Edge/Safari 모두 가능합니다.

---

## 6. 카메라 권한 문제 해결 (아이폰)

1. **HTTPS 주소**인지 확인 (`https://krgpt.github.io/...`)
2. 사이트 접속 후 주소창 왼쪽 **aA** 또는 **자물쇠** 아이콘 → **웹사이트 설정**
   → **카메라**를 **허용**으로 변경
3. 아이폰 **설정 → Safari → 카메라** → **확인** 또는 **허용**
4. 이미 거부했다면: **설정 → Safari → 고급 → 웹사이트 데이터**에서 해당 사이트 삭제 후 재접속
5. 카메라를 쓰는 다른 앱(줌, 카메라 등)을 종료한 뒤 다시 시도
6. 그래도 안 되면 화면의 **사진 선택** 버튼으로 갤러리 사진을 사용
   (아이폰 파일 선택 화면에서 **사진 촬영**을 선택해도 됩니다.)

> 카메라 API(`getUserMedia`)는 **iOS 14.3 이상**에서 안정적으로 동작합니다.
> 그보다 오래된 iOS라면 Safari 업데이트 후 이용해 주세요.

---

## 7. 보안 설정 (강력 권장)

### 7-1. Google Cloud에서 API 키 제한

1. <https://console.cloud.google.com/apis/credentials> 접속
2. 사용 중인 API 키 클릭
3. **API 제한사항** → **키 제한** → **Generative Language API**만 선택
4. **할당량**에서 일일 한도를 낮게 설정 (예: 하루 200~500회)
5. **결제 → 예산 및 알림**에서 예산 알림 설정

> 서버(Worker)에서 호출하므로 **HTTP 리퍼러 제한은 사용하면 안 됩니다.** (리퍼러가 없어서 차단됩니다.)
> 애플리케이션 제한은 **없음**으로 두고, API 제한 + 할당량으로 보호하세요.

### 7-2. Worker의 출처(Origin) 제한

`gemini-proxy.js`의 `DEFAULT_ALLOWED_ORIGINS`에 `https://krgpt.github.io`가 포함되어 있습니다.
다른 도메인에서 호출하면 403으로 거부합니다.

> CORS는 브라우저만 막을 수 있습니다. `curl` 같은 도구로 Worker를 직접 호출하는 것은 막지 못합니다.
> 그래서 아래 **요청 횟수 제한**을 함께 쓰는 것을 권장합니다.

### 7-3. (선택) 하루 요청 횟수 제한 — Cloudflare KV

1. Cloudflare 대시보드 → **Storage & Databases** → **KV** → **Create namespace**
2. 이름 예: `RATE_LIMIT_KV`
3. Worker → **Settings → Bindings → Add → KV Namespace**
   - Variable name: `RATE_LIMIT_KV`
   - KV namespace: 위에서 만든 것 선택
4. (선택) `RATE_LIMIT_PER_DAY` 변수를 추가해 하루 제한 횟수 지정 (기본 30회)

CLI로 배포하는 경우 `wrangler.toml`의 KV 부분 주석을 해제하고 id를 채우면 됩니다.

---

## 8. (선택) CLI로 배포하기

Node.js가 설치되어 있다면:

```powershell
cd "C:\ZZ-Nathan Work\AI\AI-Ring\living cal\worker"
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```

`GEMINI_API_KEY`를 입력하라는 메시지가 나오면 1단계의 키를 붙여넣습니다.

---

## 9. 동작 테스트 (선택)

Worker가 정상인지 확인하려면 PowerShell에서:

```powershell
$body = @{
  image = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\food.jpg"))
  mimeType = "image/jpeg"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://easy-calculator-gemini.myid.workers.dev/" `
  -Method Post -ContentType "application/json" -Body $body
```

정상이라면 `dishName`, `totalCalories`, `items` 등이 담긴 JSON이 반환됩니다.

---

## 10. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `분석 서버 주소(API_ENDPOINT)가 아직 설정되지 않았습니다` | HTML의 `API_ENDPOINT`를 Worker 주소로 교체 |
| `서버에 GEMINI_API_KEY Secret이 설정되지 않았습니다` | Worker Settings에서 Secret 이름을 정확히 `GEMINI_API_KEY`로 등록 |
| `허용되지 않은 출처(Origin)입니다` | Worker의 `ALLOWED_ORIGINS`에 사이트 도메인 추가 |
| `카메라 권한이 거부되었습니다` | 6번 항목 참고 (HTTPS, Safari 설정, 사이트 권한) |
| 카메라 화면이 검게 나옴 | 다른 앱이 카메라 사용 중인지 확인, 페이지 새로고침 |
| `AI 사용량이 잠시 초과되었습니다` | Gemini 무료 할당량 초과. 잠시 후 재시도 또는 결제/할당량 확인 |
| `model ... is not found` / 모델 오류 | Worker 변수 `GEMINI_MODEL`에 계정에서 사용 가능한 모델명을 지정하세요. 예: `gemini-3.8-flash`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` |
| `... is no longer available to new users` | Gemini가 해당 모델의 신규 사용을 중단한 경우입니다. 오류 메시지가 알려주는 최신 모델명(예: `gemini-3.8-flash`)을 `GEMINI_MODEL` 변수에 지정하세요. |
| 사진 분석이 계속 실패 | Worker 로그(Cloudflare → Worker → Logs)에서 Gemini 오류 확인 |

---

## 파일 구성

```
living cal/
├─ index.html
├─ cal house/
│  └─ 016-음식 칼로리 계산기.html   ← 카메라 UI + Worker 호출
└─ worker/
   ├─ gemini-proxy.js               ← Cloudflare Worker 코드
   ├─ wrangler.toml                 ← (선택) CLI 배포 설정
   └─ README.md                     ← 이 문서
```

---

## 참고: 왜 API 키를 HTML에 넣으면 안 되나요?

- HTML/JS는 사용자의 브라우저로 그대로 전달됩니다.
- `난독화`, `base64`, `숨김 변수`를 써도 개발자 도구(F12) → Sources/Network에서 모두 보입니다.
- 키가 노출되면 다른 사람이 내 할당량/결제 계정으로 API를 사용할 수 있습니다.
- 따라서 **키는 서버(Worker Secret)에만** 두고, 브라우저는 서버 주소만 호출해야 합니다.
