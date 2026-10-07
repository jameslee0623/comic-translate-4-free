# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [Tiếng Việt](README.vi.md)

Dịch trang manga/comic ngay trong trình duyệt. Toàn bộ quy trình chạy cục bộ:
phát hiện bong bóng/văn bản (RT-DETR-v2), OCR (Baberu cho tiếng Nhật/Anh/Trung),
xóa chữ
bằng kỹ thuật phục hồi nền LaMa, dịch thuật (Google / Azure / LLM cục bộ), và hiển thị lại
văn bản đã dịch vừa khít trong bong bóng thoại gốc.

Giao diện tiện ích theo ngôn ngữ của trình duyệt (tiếng Anh, tiếng Nhật,
tiếng Hàn, tiếng Trung giản thể/phồn thể, tiếng Hindi, tiếng Tây Ban Nha, tiếng Ả Rập, tiếng Pháp, tiếng Việt).

Dự án này lấy cảm hứng từ [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate).

## Tải xuống (không cần build)

**Chrome / Edge / Brave — cài đặt từ Chrome Web Store:**

[**Cài đặt comic-translate-4-free từ Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)

Hoặc tải bản mới nhất từ trang
[**Releases**](https://github.com/jameslee0623/comic-translate-4-free/releases)
— mọi bản release đều được CI build tự động. Tải file zip cho trình duyệt của bạn:

- `comic-translate-4-free-v<version>-<build>-chrome.zip` → Chrome / Edge / Brave
- `comic-translate-4-free-v<version>-<build>-firefox.zip` → Firefox

(Ngoài ra còn có file zip gộp `comic-translate-4-free-v<version>-<build>.zip`
chứa cả `chrome/` và `firefox/`, nếu bạn muốn dùng cả hai.)
Bạn không cần clone repo hay tự chạy `build.sh`.

## Cài đặt

**Chrome (khuyên dùng):** cài đặt từ
[**Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj)
— một cú nhấp chuột, tự động cập nhật.

**Cài đặt thủ công (Chrome):** tải file zip từ Releases ở trên và giải nén,
sau đó vào `chrome://extensions` → bật **Chế độ nhà phát triển** →
**Tải tiện ích đã giải nén** → chọn thư mục vừa giải nén.

**Firefox:** vào `about:debugging#/runtime/this-firefox` → **Tải tiện ích tạm thời**
→ mở thư mục đã giải nén và chọn `manifest.json`. (Tiện ích tạm thời chỉ tồn tại đến khi khởi động lại Firefox. Để cài đặt vĩnh viễn, bản build phải được ký trên addons.mozilla.org. Đang chuẩn bị bản build đã ký cho Firefox bản chuẩn.)

Sau đó tải các mô hình một lần từ trang Cài đặt — một nút
**Tải xuống tất cả mô hình** sẽ tải mọi thứ (trình phát hiện, mô hình OCR,
trình phục hồi nền, tổng ~350 MB). Chúng được lưu trong bộ nhớ đệm của trình duyệt (IndexedDB) và không bao giờ
tải lại. Kích thước byte của từng file được kiểm tra sau khi tải; file
bị cắt ngắn hoặc sai sẽ được đánh dấu ⚠ và có thể tải lại.

![Tải xuống các mô hình từ trang Cài đặt](docs/images/options-models.png)

## Sử dụng

1. **Cho phép trang web trước** — chỉ dịch trên các trang bạn cho phép
   rõ ràng. Nhấp vào biểu tượng tiện ích và bấm **Cho phép trang này**
   (hoặc thêm tên máy chủ trong Cài đặt, hoặc bật **CHO PHÉP MỌI TRANG WEB** để bỏ qua
   bước này ở mọi nơi). Đây là rào cản cứng: quy trình từ chối
   chạy ở bất kỳ nơi nào khác.

   ![Cửa sổ popup của tiện ích](docs/images/popup.png)

2. Mở một trang manga trên trang đã cho phép — trang sẽ tự động dịch
   ngay khi tải xong, không cần bấm nút
   (có thể bật/tắt trong Cài đặt ở mục "Tự động dịch khi tải trang").
   Lần đầu dùng trên mỗi trang, Chrome sẽ hỏi quyền một lần để
   tiện ích có thể tải ảnh của trang ở độ phân giải đầy đủ.
3. Một thanh trạng thái ở góc trên bên phải trang hiển thị tiến trình
   trực tiếp (Đang chụp → Đang phát hiện → OCR → …). Khi xong, ảnh gốc của trang
   được thay thế tại chỗ bằng bản đã dịch — chữ gốc được xóa bằng kỹ thuật phục hồi nền,
   bản dịch được hiển thị lại trong các bong bóng.

Để dịch một ảnh cụ thể thay vì ảnh chính của trang,
nhấp chuột phải vào ảnh và chọn **Send to comic-translate-4-free**. Ảnh đó sẽ được
đưa qua quy trình — kể cả khi nhỏ hơn kích thước ảnh tối thiểu —
và vẫn được thay thế tại chỗ. Mục menu này chỉ
xuất hiện trên các trang bạn đã cho phép.

Nếu máy chủ ảnh từ chối tải xuống (HTTP 403, ví dụ Cloudflare bot
protection), tiện ích sẽ tự động mở ảnh trong một tab nền
— ở đó ảnh là cùng nguồn (same-origin), nên ảnh được đọc trực tiếp mà không cần
tải xuống — dịch nó, đóng tab, và thay thế ảnh trên trang của bạn
tại chỗ.

   ![Menu chuột phải](docs/images/right-click.png)

Đầu vào của quy trình là ảnh lớn nhất của trang, giới hạn bởi cài đặt kích thước ảnh
tối thiểu (mặc định 500px): ảnh nhỏ hơn sẽ bị bỏ qua kèm thông báo lỗi rõ ràng.
Tiện ích đọc trực tiếp ảnh của trang — không bao giờ
chụp màn hình trang web.

**Bộ nhớ đệm trang:** các trang bạn mở lại trong cùng phiên trình duyệt sẽ tải ngay lập tức
từ bộ nhớ đệm tạm thời trên đĩa (dịch 10~40 ảnh trong một phiên có thể
làm trình duyệt bị treo, khiến mất toàn bộ ảnh trong bộ nhớ đệm. Hãy nhớ xóa
bộ nhớ đệm thủ công). Bộ nhớ đệm tự động bị xóa khi đóng trình duyệt,
và không bao giờ dùng trong cửa sổ ẩn danh.

**Cài đặt** (nhấp vào biểu tượng → Cài đặt): quyền truy cập trang, tự động dịch khi
tải trang, ngôn ngữ nguồn (gồm **Tự động phát hiện**, nhận diện
tiếng Nhật / tiếng Anh / tiếng Trung giản thể / phồn thể từ văn bản OCR)
và ngôn ngữ đích, công cụ dịch (Google miễn phí / Azure
Translator / LM Studio), nút kiểm tra kết nối cho Azure và LM Studio,
ngưỡng phát hiện, kích thước ảnh tối thiểu (mặc định 500px — ảnh chụp nhỏ hơn sẽ bị
bỏ qua), cỡ chữ, chế độ gỡ lỗi, và các tùy chọn bộ nhớ đệm trang đã dịch.

![Trang Cài đặt](docs/images/options.png)

## Ủng hộ dự án

Nếu tiện ích này hữu ích với bạn, hãy cân nhắc ủng hộ quá trình phát triển:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

### Đăng ký tài khoản Microsoft Azure

1. Tạo/đăng nhập tài khoản Microsoft/hotmail/Azure
2. Tạo Azure subscription
3. Tạo tài nguyên Azure Translator
4. Chọn gói giá F0 (Miễn phí)
5. Quản lý tài nguyên → Khóa và Điểm cuối → sao chép **KEY 1** và **Location/Region**

Microsoft hiện cho biết gói F0 miễn phí của Translator là 2 triệu ký tự/tháng và không hết hạn.

### LM Studio

Chạy LM Studio với máy chủ cục bộ đã bật (mặc định
`http://127.0.0.1:1234`). Chọn **LM Studio (máy chủ cục bộ)** làm công cụ dịch
trong Cài đặt, đặt URL máy chủ và kiểu API — **LM Studio REST API v1**
(gửi đến `/api/v1/chat`) hoặc **Tương thích OpenAI** (gửi đến
`/v1/chat/completions`) — rồi bấm **Kiểm tra kết nối LM Studio** để
xác minh. Mô hình đang tải được phát hiện tự động và ghi nhớ, nên không
có trường nhập tên mô hình.

## Build từ mã nguồn

Không cần bundler, không cần npm install — mã nguồn chính là tiện ích. Yêu cầu:
`bash`, `python3`, `rsync`, `zip`, và `node` (chỉ dùng để kiểm tra cú pháp).

```bash
git clone https://github.com/jameslee0623/comic-translate-4-free.git
cd comic-translate-4-free
./build.sh
```

Lệnh này tạo ba file zip trong `dist/` (kèm một bản sao của file zip gộp cho
tiện):

- `comic-translate-4-free-v<version>-<build>.zip` — bản gộp, `chrome/` và
  `firefox/` cạnh nhau, sẵn sàng tải unpacked (Chrome) hoặc làm tiện ích tạm thời
  (Firefox) theo hướng dẫn "Cài đặt" ở trên
- `comic-translate-4-free-v<version>-<build>-chrome.zip` — chỉ bản Chrome,
  đúng cấu trúc nộp lên store
- `comic-translate-4-free-v<version>-<build>-firefox.zip` — chỉ bản Firefox,
  đúng cấu trúc nộp lên store

Dấu `<build>` lấy từ hằng `BUILD` trong `src/shared/version.js`
(hiển thị ở chân trang popup và trang cài đặt, dùng trong khóa bộ nhớ đệm trang).
Tăng nó trước khi build nếu bạn muốn dấu riêng trong tên file và chân trang UI
— nếu không, bản build của bạn sẽ không phân biệt được với bản release
cùng dấu.

Mỗi trang, tiện ích gửi một request gộp duy nhất:

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

Mô hình được kỳ vọng trả về một mảng JSON các chuỗi đã dịch —
một chuỗi cho mỗi văn bản đầu vào, theo đúng thứ tự. Một `[...]` trần trong câu trả lời dài hơn
được chấp nhận; mỗi bản dịch một dòng là phương án dự phòng cuối cùng.

## Chế độ gỡ lỗi

Bật **Chế độ gỡ lỗi** trong Cài đặt và đầu ra của mọi giai đoạn sẽ hiện trong
bảng kiểm tra bên cạnh: ảnh đã chụp, khung phát hiện, khối văn bản, ảnh cắt OCR + kết quả đọc,
mặt nạ phục hồi nền, trang đã phục hồi nền, và bản dịch.

## Kiến trúc

```
popup / settings (src/ui)
      │ chrome.runtime messages
      ▼
background — điều phối, chụp, khối, mặt nạ, API dịch thuật,
             phát sự kiện gỡ lỗi
  ├─ Chrome: service worker + offscreen document (src/offscreen) chứa
  │  TẤT CẢ phiên onnxruntime-web (việc tải xuống chạy ở đó nên một lần fetch 197 MB
  │  vẫn sống sót khi SW tắt)
  └─ Firefox: trang nền (src/background/background.html) chứa các
     phiên tương tự trong cùng tiến trình (Firefox không có offscreen document)
└── content script (src/content) — canvas phủ + trình hiển thị văn bản + bảng gỡ lỗi
```

Các mô hình (Hugging Face, tải khi cần):
- `ogkalu/comic-text-and-bubble-detector` → `detector-v4-s_int8.onnx`
- `genshiai-daichi/baberu-ocr` → `vision_int4.onnx`, `decoder_prefill_int8.onnx`,
  `decoder_step_int8.onnx` (tiếng Nhật, tiếng Anh, tiếng Trung giản thể/phồn thể)
- `ogkalu/lama-manga-onnx-dynamic` → `lama-manga-dynamic.onnx`

Các giai đoạn: capture → detect → blocks → OCR → mask → inpaint →
translate → render. Phát hiện chạy ở 640×640; ảnh chụp được thu nhỏ theo diện tích
(ngân sách 6.5 MP) để dải ảnh dài giữ nguyên độ phân giải đầy đủ, và các trang có tỉ lệ
khung hình cực đoan hơn 4:1 được xử lý theo từng đoạn 2:1 chồng lấn.

**Quy trình Chrome vs Firefox:** cả hai bản đều chạy dịch thuật song song với
mask/inpaint sau OCR. Chrome dùng Promise.all — các phiên ML
nằm trong offscreen document trên luồng riêng, nên các giai đoạn thực sự
chồng lấn. Firefox chạy dịch thuật trên Web Worker (luồng riêng) trong khi
mask → inpaint chạy trên luồng chính — I/O mạng của worker không bị
chặn khi WASM inpaint chiếm luồng chính.

## Hạn chế đã biết

- Chưa tìm được OCR tiếng Hàn tốt — ngôn ngữ nguồn giới hạn ở tiếng Nhật,
  tiếng Anh, và tiếng Trung giản thể/phồn thể.
- Tự động dịch xử lý một ảnh mỗi trang (ảnh chính của trang).
  Để dịch ảnh khác trên trang, nhấp chuột phải vào ảnh và chọn
  **Send to comic-translate-4-free**.
- Một số máy chủ ảnh chặn tải xuống tự động (HTTP 403, ví dụ Cloudflare bot
  protection) dù trang vẫn tải ảnh bình thường. Chuột phải
  **Send to comic-translate-4-free** khắc phục điều này qua
  tab nền; tự động dịch trên các trang như vậy có thể lỗi 403.
  Việc chặn này có thể không ổn định (lúc bị lúc không).
- Firefox: các mô hình AI chạy trong trang nền của trình duyệt (Firefox không có
  offscreen document), dùng chung bộ nhớ với mọi thứ khác. Trên trang rất lớn
  hoặc phiên dùng lâu, engine có thể hết bộ nhớ và báo
  "no available backend found". Khởi động lại trình duyệt sẽ giải phóng bộ nhớ; Chrome không bị
  ảnh hưởng vì chạy mô hình trong tiến trình riêng.
- Chrome: dịch hàng chục ảnh trong một phiên có thể làm trình duyệt bị treo
  (ghi nhận ở khoảng 35 ảnh đã lưu đệm).
- Bộ nhớ đệm trang có phạm vi phiên: bị xóa khi trình duyệt khởi động, nên
  sau khi khởi động lại (kể cả sau khi treo) các ảnh gửi lại sẽ chạy toàn bộ
  quy trình thay vì trúng bộ nhớ đệm.
- Công cụ dịch Google dùng endpoint không chính thức `translate.googleapis.com`
  và có thể bị giới hạn tốc độ.
- Văn bản dọc được hiển thị cho các khối CJK cao; SFX / văn bản ngoài bong bóng
  dùng hộp văn bản riêng.

## Thông báo bên thứ ba

Các thư viện đi kèm, mã nguồn được chuyển thể, và mô hình tải khi chạy được liệt kê kèm
giấy phép trong [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
