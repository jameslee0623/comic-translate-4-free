# comic-translate-4-free

**Language:** [English](README.md) · [हिन्दी](README.hi.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · [বাংলা](README.bn.md) · [Português](README.pt.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Deutsch](README.de.md)

Đọc manga bằng ngôn ngữ của bạn — ngay trong trình duyệt.

comic-translate-4-free tự động dịch các trang manga và truyện tranh khi bạn lướt web. Nó đọc tiếng Nhật, tiếng Anh, tiếng Trung giản thể và phồn thể (có tự động nhận diện ngôn ngữ), và dịch sang 114 ngôn ngữ. Mở một trang lên, bản dịch sẽ thay thế ảnh gốc ngay tại chỗ — các khung thoại được lấp đầy bằng ngôn ngữ của bạn.

### 📸 Trước & Sau

| Trước (tiếng Nhật) | Sau (Tiếng Việt) |
| --- | --- |
| ![Trang manga tiếng Nhật gốc](docs/images/wikipe-tan-original.jpg) | ![Được dịch sang tiếng Việt](docs/images/wikipe-tan-vi.jpg) |

<details>
<summary>Xem bản dịch ở 14 ngôn ngữ khác</summary>

| tiếng Hindi | tiếng Hàn | tiếng Trung giản thể |
| --- | --- | --- |
| ![tiếng Hindi](docs/images/wikipe-tan-hi.jpg) | ![tiếng Hàn](docs/images/wikipe-tan-ko.jpg) | ![tiếng Trung giản thể](docs/images/wikipe-tan-zh-CN.jpg) |

| tiếng Trung phồn thể | tiếng Tây Ban Nha | tiếng Ả Rập |
| --- | --- | --- |
| ![tiếng Trung phồn thể](docs/images/wikipe-tan-zh-TW.jpg) | ![tiếng Tây Ban Nha](docs/images/wikipe-tan-es.jpg) | ![tiếng Ả Rập](docs/images/wikipe-tan-ar.jpg) |

| tiếng Pháp | tiếng Bengali | tiếng Bồ Đào Nha |
| --- | --- | --- |
| ![tiếng Pháp](docs/images/wikipe-tan-fr.jpg) | ![tiếng Bengali](docs/images/wikipe-tan-bn.jpg) | ![tiếng Bồ Đào Nha](docs/images/wikipe-tan-pt.jpg) |

| tiếng Nga | tiếng Việt | tiếng Indonesia |
| --- | --- | --- |
| ![tiếng Nga](docs/images/wikipe-tan-ru.jpg) | ![tiếng Việt](docs/images/wikipe-tan-vi.jpg) | ![tiếng Indonesia](docs/images/wikipe-tan-id.jpg) |

| tiếng Urdu | tiếng Đức |
| --- | --- |
| ![tiếng Urdu](docs/images/wikipe-tan-ur.jpg) | ![tiếng Đức](docs/images/wikipe-tan-de.jpg) |

</details>

*Ảnh gốc: [Wikipedia](https://en.wikipedia.org/wiki/Manga) qua Wikimedia Commons.*

---

## ✨ Tính năng

- **Dịch tự động** — mở một trang manga trên trang web đã được cho phép và bản dịch sẽ hiện ngay tại chỗ, không cần bấm nút.
- **Nhấp chuột phải vào bất kỳ ảnh nào** — chọn "Send to comic-translate-4-free" để dịch một ảnh cụ thể, ngay cả ảnh nhỏ hơn kích thước tối thiểu.
- **114 ngôn ngữ đích** thông qua Google Translate, Azure Translator, hoặc máy chủ LM Studio cục bộ của bạn.
- **Tự động nhận diện ngôn ngữ gốc** — tiếng Nhật, tiếng Anh, tiếng Trung giản thể/phồn thể được nhận diện tự động từ văn bản đã OCR.
- **Hỗ trợ truyện dọc / webtoon** — các trang dài được xử lý theo từng đoạn chồng lên nhau để chữ luôn sắc nét.
- **16 ngôn ngữ giao diện** — giao diện tiện ích mở rộng tự theo thiết lập ngôn ngữ của trình duyệt.

### 🔒 Quyền riêng tư

- **AI chạy ngay trên máy của bạn.** Nhận diện khung thoại, OCR và inpainting đều chạy cục bộ trong trình duyệt qua WebAssembly. Các trang bạn xem không bao giờ rời khỏi thiết bị của bạn.
- **Chỉ văn bản cần dịch mới được gửi đi** — chỉ các chuỗi đã trích xuất được gửi đến dịch vụ dịch thuật bạn chọn (Google / Azure / LM Studio cục bộ của bạn).
- **Không tài khoản, không theo dõi, không đo lường.** Mọi thiết lập và model đã tải đều nằm trong bộ nhớ cục bộ của trình duyệt.

---

## 🚀 Cài đặt

**Chrome / Edge / Brave:**

[**Cài đặt từ Chrome Web Store**](https://chromewebstore.google.com/detail/pndooikgcenncdohfggodonniihplppj) — một cú nhấp chuột, tự động cập nhật.

**Firefox:** tải file zip Firefox từ [Releases](https://github.com/jameslee0623/comic-translate-4-free/releases), rồi vào `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → chọn `manifest.json`. (Add-on tạm thời sẽ bị gỡ khi khởi động lại; danh sách AMO đã ký đang được hoàn thiện.)

Sau khi cài đặt, mở trang Settings và bấm **Download all models** một lần (~350 MB: detector, OCR, inpainter). Các model được lưu trong bộ nhớ đệm của trình duyệt và xác minh theo dung lượng byte.

![Tải các model từ trang Settings](docs/images/options-models.png)

---

## 💡 Cách sử dụng

1. **Cho phép trang web trước** — bấm vào biểu tượng tiện ích mở rộng rồi chọn **Allow this site** (hoặc bật **ALLOW ALL SITES**). Tính năng dịch chỉ chạy ở những nơi bạn đã cấp quyền.

   ![Cho phép trang web từ popup](docs/images/popup.png)

2. **Tải lại trang manga** — quá trình dịch tự động bắt đầu khi trang tải xong. Một viên pill ở góc trên bên phải hiển thị tiến trình trực tiếp (Capturing → Detecting → OCR → …).
3. **Xong** — ảnh của trang được thay thế ngay tại chỗ bằng bản dịch.

**Mẹo:**
- Nhấp chuột phải vào bất kỳ ảnh nào → **Send to comic-translate-4-free** để chỉ dịch ảnh đó.

  ![Nhấp chuột phải để gửi ảnh](docs/images/right-click.png)

- Nếu trang web chặn tải xuống (lỗi HTTP 403), tiện ích sẽ tự động thử lại qua một tab nền.
- Chọn công cụ dịch trong Settings: Google (miễn phí, không cần key), Azure Translator (đăng ký key ở dưới — miễn phí 2 triệu ký tự/tháng), hoặc LM Studio (máy chủ cục bộ).
- Bật **Debug mode** trong Settings để kiểm tra từng giai đoạn của pipeline.

---

## 🔑 Đăng ký tài khoản Microsoft Azure

Để dùng Azure Translator làm công cụ dịch:

1. Tạo/đăng nhập tài khoản Microsoft/hotmail/Azure
2. Tạo gói đăng ký Azure (subscription)
3. Tạo tài nguyên Azure Translator
4. Chọn gói giá F0 (Free) — 2 triệu ký tự/tháng, không hết hạn
5. Resource Management → Keys and Endpoint → sao chép **KEY 1** và **Location/Region**
6. Dán chúng vào trang Settings của tiện ích mở rộng

---

## ❤️ Ủng hộ dự án

Nếu tiện ích này hữu ích với bạn, hãy cân nhắc ủng hộ sự phát triển của nó:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S5X627XJQW)

---

## ⚠️ Các vấn đề đã biết

- **Chưa có OCR tiếng Hàn** — ngôn ngữ gốc gồm tiếng Nhật, tiếng Anh và tiếng Trung giản thể/phồn thể. (Tiếng Hàn vẫn có trong danh sách ngôn ngữ đích.)
- **Một ảnh mỗi trang** cho chế độ tự dịch (ảnh chính của trang). Dùng chuột phải → Send để dịch các ảnh khác.
- **Phiên làm việc lớn** — dịch hàng chục ảnh trong một phiên có thể làm trình duyệt bị treo. Hãy xóa page cache trong Settings nếu gặp tình trạng này.
- **Firefox** — các model chạy trên background page (không dùng offscreen document), chia sẻ bộ nhớ với mọi thứ khác. Hãy khởi động lại trình duyệt nếu thấy lỗi "no available backend found".
- Google Translate dùng endpoint miễn phí không chính thức và có thể bị giới hạn tốc độ.

---

## 📄 Thông báo bên thứ ba

Dự án này lấy cảm hứng từ [ogkalu2/comic-translate](https://github.com/ogkalu2/comic-translate) — bộ nhận diện khung thoại/văn bản và bộ inpainting LaMa được tinh chỉnh cho manga là các bản ONNX export của nó, và logic suy luận được chuyển thể từ đó. (OCR dùng [Baberu](https://huggingface.co/genshiai-daichi/baberu-ocr) của genshiai-daichi.)

Các thư viện đi kèm, code được chuyển thể và các model tải về khi chạy được liệt kê cùng giấy phép trong [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Giấy phép MIT — xem [LICENSE](LICENSE).
