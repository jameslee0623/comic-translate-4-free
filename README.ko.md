# comic-translate-4-free

**언어:** [English](README.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

브라우저에서 만화/코믹 페이지를 번역합니다. 전체 파이프라인이 로컬에서 실행됩니다:
말풍선/텍스트 감지(RT-DETR-v2), OCR(일본어·영어·중국어 간체는 Baberu, 한국어는 PP-OCRv5,
중국어 번체는 PP-OCRv6), LaMa 인페인팅으로 원문 제거, 번역(Google / Azure /
로컬 LLM), 그리고 원래 말풍선에 맞춘 줄바꿈 다시 그리기.

확장 프로그램 UI는 브라우저의 언어 설정을 따릅니다(영어, 일본어, 한국어,
중국어 간체/번체).

[ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate)를
Manifest V3 + ONNX Runtime Web(WASM)으로 포팅한 것입니다.

## 다운로드(빌드 불필요)

[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
페이지에서 설치용 zip을 받으세요 — 모든 릴리스는 CI가 자동 빌드하며
`chrome/`과 `firefox/`가 함께 들어 있습니다. 압축을 푼 뒤 아래 "설치"를
따르세요. 저장소를 클론하거나 `build.sh`를 직접 실행할 필요가 없습니다.

## 설치

zip에는 두 빌드가 들어 있습니다: `chrome/`과 `firefox/`.

**Chrome:** `chrome://extensions` → **개발자 모드** 활성화 →
**압축해제된 확장 프로그램 로드** → `chrome/` 폴더 선택.

**Firefox:** `about:debugging#/runtime/this-firefox` → **임시 부가 기능 로드** →
`firefox/` 폴더를 열어 `manifest.json` 선택. (임시 부가 기능은 Firefox를
다시 시작할 때까지 유지됩니다. 영구 설치하려면 addons.mozilla.org에서
서명된 빌드가 필요합니다.)

다음으로 옵션 페이지에서 모델을 한 번 다운로드합니다 —
**Download all models** 버튼 하나로 전부 받습니다(감지기, OCR 모델,
인페인터, 총 약 350MB). 브라우저(IndexedDB)에 캐시되어 다시 다운로드하지
않습니다. 각 파일의 바이트 크기는 다운로드 후 검증되며, 손상된 파일에는
⚠ 표시가 붙고 다시 다운로드할 수 있습니다.

## 사용법

1. **먼저 사이트를 허용 목록에 등록** — 번역은 명시적으로 허용한 사이트에서만
   실행됩니다. 확장 프로그램 아이콘을 클릭해 **Add this site to whitelist**를
   누르거나 옵션에서 호스트 이름을 추가하세요. 이는 엄격한 게이트입니다:
   다른 사이트에서는 파이프라인이 실행되지 않습니다.
2. 허용 목록에 등록된 사이트에서 만화 페이지를 엽니다.
3. 확장 프로그램 아이콘 클릭 → **Translate this page**.
   사이트별 첫 사용 시 페이지 이미지를 최대 해상도로 가져오기 위해
   Chrome이 일회성 권한을 요청합니다.
4. 페이지 모서리의 상태 pill에 실시간 진행률이 표시됩니다
   (Capturing → Detecting → OCR → …). 완료되면 페이지의 그림 자체가 번역된
   버전으로 교체됩니다 — 원문은 인페인팅으로 지워지고 번역문이 말풍선 안에
   다시 그려집니다. 뚜렷한 메인 이미지가 없는 페이지는 대신 오버레이로
   표시됩니다.

파이프라인 입력은 페이지에서 가장 큰 이미지이며 최소 이미지 크기 설정
(기본값 500px)으로 걸러집니다: 더 작은 그림은 명확한 오류와 함께 건너뜁니다.
확장 프로그램은 페이지의 이미지를 직접 읽습니다 — 웹페이지 스크린샷을
찍지 않습니다.

**옵션**(아이콘 우클릭 → 옵션): 사이트 허용 목록, 원본/대상 언어, 번역
백엔드(Google 무료 / Azure Translator / LM Studio / 실험적 로컬 LLM),
Azure·LM Studio 연결 테스트 버튼, 감지 임계값, 최소 이미지 크기
(기본값 500px — 더 작은 캡처는 건너뜀), 글꼴 크기, 디버그 모드.

### LM Studio

OpenAI 호환 서버를 활성화한 LM Studio를 실행합니다(기본값
`http://localhost:1234`, 서버 경로 `/v1`). 옵션에서 백엔드로
**LM Studio (local)**를 선택하고 서버 URL을 설정한 뒤
**Check LM Studio connection**으로 연결을 확인하세요.

## 소스에서 빌드

번들러도 npm install도 불필요 — 소스 자체가 확장 프로그램입니다. 필요한 것:
`bash`, `python3`, `rsync`, `zip`, `node`(구문 검사용).

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

`dist/comic-translate-4-free-v<version>-<build>.zip`이 생성되며 `chrome/`과
`firefox/`가 함께 들어 있습니다. 위 "설치"의 순서대로 불러오면 됩니다
(Chrome은 압축해제된 확장 프로그램으로, Firefox는 임시 부가 기능으로).

`<build>` 스탬프는 `src/ui/options.js`와 `src/ui/popup.js` 상단의 `BUILD`
상수에서 옵니다(둘을 동기화하세요). 빌드 전에 올려 두면 파일 이름과 UI
푸터에 고유한 스탬프가 찍힙니다 — 올리지 않으면 같은 스탬프의 릴리스 빌드와
구별할 수 없습니다.

페이지마다 확장 프로그램은 하나의 배치 요청을 보냅니다:

```
POST {server}/chat/completions
{
  "messages": [
    { "role": "user",
      "content": "Translate the following 9 text(s) from Japanese to Chinese (Traditional):\n[\"…\",\"…\"]" }
  ],
  "temperature": 0,
  "texts": ["…", "…"],
  "target": "zh-TW",
  "source": "ja"
}
```

모델은 번역문 문자열의 JSON 배열로 응답해야 합니다 —
입력 텍스트와 같은 개수, 같은 순서. 긴 응답 안의素 `[...]`도 허용되며,
최후의 수단으로 한 줄에 하나씩의 폴백도 있습니다.

## 디버그 모드

옵션에서 **디버그 모드**를 켜면 모든 파이프라인 단계의 출력이 사이드 패널
인스펙터에 나타납니다: 캡처 이미지, 감지 박스, 텍스트 블록, OCR 크롭+판독값,
인페인트 마스크, 인페인트된 페이지, 번역문.

## 아키텍처

```
popup / options (src/ui)
      │ chrome.runtime messages
      ▼
background — 오케스트레이션, 캡처, 블록, 마스크, 번역 API,
             디버그 출력
  ├─ Chrome: service worker + offscreen document (src/offscreen)가
  │  모든 onnxruntime-web 세션을 호스트
  │  (197MB 다운로드가 SW 종료 중에도 이어지도록 다운로드는 여기서 실행)
  └─ Firefox: background page (src/background/background.html)가
     같은 세션을 인프로세스로 호스트(Firefox에는 offscreen document가 없음)
└── content script (src/content) — 오버레이 캔버스 + 텍스트 렌더러 + 디버그 패널
```

모델(Hugging Face, 필요 시 다운로드):
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`, `decoder_prefill_int8.onnx`,
  `decoder_step_int8.onnx`(일본어, 영어, 중국어 간체)
- `PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx` → `inference.onnx`(한국어)
- `PaddlePaddle/PP-OCRv6_small_rec_onnx` → `inference.onnx`(중국어 번체)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

파이프라인 단계: capture → detect → blocks → OCR → mask → inpaint →
translate → render. 감지는 640×640으로 실행되며, 세로가 3.5:1을 넘는 페이지는
겹치는 수직 슬라이스로 처리합니다.

## 알려진 제한

- 로컬 LLM 백엔드는 실험적입니다(WebGPU + 수 GB 다운로드 필요).
- Google 백엔드는 비공식 `translate.googleapis.com` 엔드포인트를 사용하며
  속도 제한이 있을 수 있습니다. Azure는 본인의 키가 필요합니다.
- OCR 엔진: Baberu(일본어·영어·중국어 간체), PP-OCRv5(한국어),
  PP-OCRv6(중국어 번체).
- 세로 텍스트는 키가 큰 CJK 블록용으로 렌더링되며, 말풍선 밖의 효과음 등은
  자체 텍스트 상자를 사용합니다.

## 서드파티 고지

번들된 라이브러리, 포팅된 코드, 실행 시 다운로드되는 모델은 라이선스와 함께
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)에 정리되어 있습니다.
