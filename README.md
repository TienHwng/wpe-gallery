# wpe-gallery

Preview nhiều link Wallpaper Engine (Steam Workshop) cùng lúc dưới dạng gallery HTML. Tool tự lọc trùng.

## Setup
```bash
uv sync
```

## Dùng
```bash
uv run wpe-gallery samples/*.txt --links-out output/links_dedup.txt
```
- Nhận nhiều file text, mỗi file chứa link `...filedetails/?id=...`, định dạng tùy ý.
- In ra các ID bị trùng (kèm file:dòng), rồi gọi Steam API theo batch 100 ID.
- Thông tin từ Steam được lưu trong `output/cache/` 7 ngày, nên các lần chạy sau chỉ gọi Steam cho link mới. Thêm `--refresh` để lấy lại toàn bộ.
- Xuất `output/gallery.html` và tự mở trình duyệt. Thêm `--no-open` nếu không muốn mở, `-o` để đổi đường dẫn output.
- Mọi file sinh ra đều nằm trong `output/`, có thể xóa thư mục này bất cứ lúc nào.

## Lọc wallpaper trong gallery
- Lần đầu mở, trang hiện Bản đồ màu: mọi wallpaper trên một màn hình, xếp theo màu. Bấm một ô để duyệt các ảnh cùng tông trước, kéo qua một vùng để chọn theo cảm hứng, hoặc nhấn `A` từ bất kỳ đâu để quay lại. Duyệt xong một vòng, trang đưa bạn về đúng màn hình đã bắt đầu.
- Nhấn `S` để vào chế độ duyệt từng wallpaper: `→` giữ, `←` bỏ qua, `Z` hoàn tác, `O` mở trên Steam, hoặc kéo ảnh sang trái/phải. Khi đã duyệt dở, lần sau trang mở thẳng vào đây.
- `G` mở lưới toàn bộ wallpaper, có sắp xếp theo độ phổ biến, dung lượng hoặc ngày đăng. Ô lọc và các nút tag dùng chung cho lưới và bản đồ màu, và nút `Duyệt` chỉ duyệt các kết quả đang hiện. Nút `Đã xóa` trên lưới hiện riêng các item không còn trên Steam.
- `F` mở màn hình tổng kết: mở lần lượt từng link trên Steam, hoặc lưu thành `wpe-kept.txt` để đưa lại vào tool.
- Wallpaper gắn tag Mature hoặc Questionable được làm mờ sẵn. Nhấn `M` để bật hoặc tắt.
- Lựa chọn được lưu trong trình duyệt, kể cả khi mở gallery khác. Dùng `Xuất tiến độ` và `Nạp tiến độ` ở màn hình tổng kết để chuyển sang trình duyệt hoặc máy khác.

## Cấu trúc project
```text
samples/               File link mẫu để chạy thử
src/wpe_gallery/
  cli.py               Lệnh wpe-gallery, nối các bước với nhau
  links.py             Tìm và lọc trùng ID trong file text
  steam.py             Lấy thông tin wallpaper từ Steam API
  render.py            Ghép dữ liệu và file web thành một trang HTML
  web/
    gallery.html       Khung trang
    gallery.css        Giao diện
    gallery.js         Tương tác: duyệt, lọc, lưu lựa chọn
```

Sửa giao diện trong `web/` rồi chạy lại lệnh `wpe-gallery` để tạo lại `output/gallery.html`. File này đã gộp sẵn CSS và JS, nên chỉ cần một file là mở được.

## Kiểm tra và định dạng code
```bash
uv run ruff check
uv run ruff format
npx prettier@3.3.3 --write src/wpe_gallery/web
```
