# Chrome Web Store listing — Tiếng Việt (vi)

## Short description (132 chars max)

Dịch manga & truyện tranh trên trình duyệt. Đọc tiếng Nhật, tiếng Anh, tiếng Trung giản thể & phồn thể; dịch ra 114 ngôn ngữ.

(Count: 125)

## Detailed description

📖 Đọc manga bằng ngôn ngữ của bạn!

comic-translate-4-free tự động dịch manga và truyện tranh khi bạn duyệt web. Nó đọc tiếng Nhật, tiếng Anh, tiếng Trung giản thể/phồn thể (tự động phát hiện), và dịch sang 114 ngôn ngữ, thay thế hình ảnh ngay tại chỗ.

✨ Tính năng
- Dịch tự động — mở một trang manga trên một trang web được phép và bản dịch sẽ xuất hiện ngay tại chỗ, không cần bấm nút.
- Mỗi hình ảnh trên trang — dịch tự động xử lý tất cả hình ảnh trên một trang (tối đa 50 hình mỗi lần chạy), không chỉ hình ảnh chính.
- Nhấp chuột phải vào bất kỳ hình ảnh nào — chọn "Gửi đến comic-translate-4-free" để dịch một hình ảnh cụ thể, ngay cả khi nó nhỏ hơn kích thước tối thiểu.
- 114 ngôn ngữ đích qua Google Translate, Azure Translator, hoặc máy chủ LM Studio cục bộ của riêng bạn.
- Tự động phát hiện ngôn ngữ nguồn — tiếng Nhật, tiếng Anh, tiếng Trung giản thể/phồn thể được xác định tự động từ văn bản đã OCR.
- Hỗ trợ truyện dài / webtoon — các trang cao được xử lý thành các đoạn chồng lên nhau để chữ vẫn sắc nét.
- 17 ngôn ngữ giao diện — giao diện của tiện ích mở rộng tuân theo cài đặt ngôn ngữ của trình duyệt của bạn.

🔒 Quyền riêng tư
- AI chạy trên máy của bạn. Phát hiện bong bóng, OCR và inpainting đều chạy cục bộ trong trình duyệt của bạn. Phát hiện và OCR chạy qua WebAssembly. Inpainting chạy trên GPU trên Chrome (với WebAssembly dự phòng), và qua WebAssembly trên Firefox. Trang của bạn không bao giờ rời khỏi thiết bị của bạn.
- Chỉ văn bản đã dịch được gửi ra ngoài — chỉ các chuỗi đã trích xuất mới đến dịch vụ dịch thuật bạn chọn (Google / Azure / LM Studio cục bộ của bạn).
- Không tài khoản, không theo dõi, không đo từ xa. Mọi cài đặt và mô hình đã lưu trong bộ nhớ đệm đều ở trong bộ nhớ cục bộ của trình duyệt của bạn.

💡 Cách sử dụng
- Cho phép trang web trước — nhấp vào biểu tượng tiện ích mở rộng và nhấn Cho phép trang này (hoặc bật Cho phép mọi trang web). Dịch chỉ chạy ở nơi bạn đã cấp quyền.

- Tải lại trang manga — nó bắt đầu dịch tự động khi trang tải. Một viên thuốc ở góc trên bên phải hiển thị tiến trình trực tiếp (Capturing → Detecting → OCR → …).
- Xong — các hình ảnh của trang được thay thế ngay tại chỗ bằng bản dịch.

Mẹo:
- Nhấp chuột phải vào bất kỳ hình ảnh nào → Gửi đến comic-translate-4-free để chỉ dịch hình ảnh đó.

- Nếu một trang web chặn tải xuống (HTTP 403), tiện ích mở rộng sẽ tự động thử lại qua một tab nền.
- Chọn công cụ dịch của bạn trong Cài đặt: Google (miễn phí, không cần khóa), Azure Translator (đăng ký khóa bên dưới — 2 triệu ký tự/tháng miễn phí), hoặc LM Studio (máy chủ cục bộ).
- Bật Chế độ gỡ lỗi (xem từng giai đoạn) trong Cài đặt để kiểm tra từng giai đoạn của quy trình.

⚠️ Vấn đề đã biết
- Chưa có OCR tiếng Hàn — ngôn ngữ nguồn là tiếng Nhật, tiếng Anh và tiếng Trung giản thể/phồn thể. (Tiếng Hàn vẫn có sẵn dưới dạng ngôn ngữ đích của bản dịch.)
- Phiên lớn — dịch hàng chục hình ảnh trong một phiên có thể khởi động lại tiện ích mở rộng ở chế độ nền. Nếu điều đó xảy ra, quá trình chạy sẽ tự động tiếp tục từ chỗ đã dừng lại.
- Firefox — các mô hình chạy trong trang nền (không có tài liệu offscreen), chia sẻ bộ nhớ với mọi thứ khác. Khởi động lại trình duyệt nếu bạn thấy "no available backend found".
- Firefox chậm hơn Chrome — các tiện ích mở rộng của Firefox không thể dùng bộ nhớ dùng chung cho đa luồng (SharedArrayBuffer), vì vậy mô hình chạy trên một luồng CPU duy nhất. Đây là giới hạn của nền tảng Firefox, không phải lỗi của tiện ích mở rộng. (Lỗi Mozilla 1673477).
- Google Translate sử dụng endpoint miễn phí không chính thức và có thể bị giới hạn tốc độ.

📄 Thông báo của bên thứ ba
Dự án này lấy cảm hứng từ ogkalu2/comic-translate — trình phát hiện bong bóng/văn bản và trình inpainting LaMa được huấn luyện trên manga là các bản xuất ONNX của nó, và logic suy luận được chuyển từ đó. (OCR sử dụng Baberu của genshiai-daichi.)

Các thư viện đi kèm, mã đã chuyển và các mô hình tải xuống trong thời gian chạy được liệt kê cùng với giấy phép của chúng trong THIRD-PARTY-NOTICES.md.

PolyForm Noncommercial License 1.0.0 — xem LICENSE.
https://github.com/jameslee0623/comic-translate-4-free
