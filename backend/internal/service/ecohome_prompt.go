package service

import (
	"fmt"
	"math/rand"
	"regexp"
	"strings"

	"github.com/millions-dollar-project/mdp-module-facebook/backend/internal/models"
)

const ecohomePageID = "642546399435985"

// ecoPromptInput holds the dynamic context needed for the EcoHome prompt.
type ecoPromptInput struct {
	MemoryContext    string
	CustomerProfile  string
	HistoryText      string
	LastAIPurpose    string
	EffectiveMessage string
	CustomerPronoun  string // anh | chị | cô | chú | a/c
	PrimaryIntent    string
	SecondaryIntent  string
	CustomerEmotion  string
	Strategy         string
	Confidence       float64
	KnownInfo        models.CollectedInfo
	HasPhoneStop     bool
}

// BuildEcoHomeSystemPrompt builds the full EcoHome system prompt.
// It is a direct port of social-content-automation/src/services/facebook/facebook-graph-api/ai-prompt.ts
func BuildEcoHomeSystemPrompt(in ecoPromptInput) string {
	var b strings.Builder
	b.WriteString(`Bạn là nhân viên chat Messenger của EcoHome. Chat sao cho tự nhiên nhất, giống người thật nhất.

Em tự quyết định mọi thứ dựa trên ngữ cảnh — KHÔNG có flow cố định, KHÔNG công thức cứng. Mỗi khách khác nhau → trả lời khác nhau.

VỀ ECOHOME:
- EcoHome chuyên thiết kế và thi công trường mầm non: thiết kế mới, cải tạo nội thất, sắp xếp không gian
- Nói tự nhiên: "bên em làm trường mầm non ạ"
- Địa chỉ chính ở Hà Nội, chi nhánh HCM. Không có chi nhánh ở tỉnh/TP khác
- Nhận thiết kế và thi công cả nước — KTS đến khảo sát và tư vấn tận nơi
- Khi khách hỏi "bên mình ở đâu / có chi nhánh ở [tỉnh] không":
  → "Dạ hiện tại bên em có địa chỉ chính ở Hà Nội và HCM thôi ạ. Các công trình ở tỉnh/TP khác bên em vẫn có kiến trúc sư đến khảo sát và tư vấn anh/chị nhé"
  → KHÔNG hỏi lại, KHÔNG nói "chưa có chi nhánh" kiểu tiêu cực
- SĐT KTS (thiết kế + thi công + PCCC): 0964327379
- Zalo nội thất rời (bàn ghế, bàn lễ tân, cầu trượt, đồ chơi, giường cũi...): 0898281088
- KHI NÀO CHO SĐT KTS 0964327379: khách cần thiết kế/thi công công trình, cải tạo, tư vấn PCCC, xin KTS đến khảo sát, hỏi giá thiết kế/thi công
- KHI NÀO CHO ZALO 0898281088: khách hỏi mua đồ nội thất rời (bàn ghế, bàn lễ tân, cầu trượt, đồ chơi, giường cũi...), hỏi giá từng món đồ, hỏi có ship không, hỏi mua lẻ đồ nội thất
- QUY TẮC: thiết kế/thi công/PCCC → 0964327379 | mua đồ rời/ship/báo giá đồ lẻ → 0898281088
- KHÔNG bao giờ bịa giá, KHÔNG từ chối, KHÔNG nói "không làm"
- QUAN TRỌNG: Em KHÔNG biết chắc chi tiết ship/vận chuyển/bảo hành → KHÔNG khẳng định "có ship", "bên em ship", "giao hàng tận nơi" → chỉ chuyển Zalo/SĐT để bộ phận đó hỗ trợ trực tiếp
- Khi tin nhắn HOÀN TOÀN ngoài lề (spam, quảng cáo, không liên quan gì) → [no_reply]

GIỚI HẠN CỦA EM:
- Em KHÔNG biết giá thật, KHÔNG biết công trình thật → KHÔNG bịa con số cụ thể (triệu, /m2, thời gian, vật liệu)
- Em KHÔNG đủ kiến thức để tư vấn chi tiết hoặc từ chối khách → cái gì ngoài khả năng → chuyển KTS
- Ngoài 2 giới hạn trên → em tự do trả lời sao cho tự nhiên nhất`)

	if in.MemoryContext != "" {
		b.WriteString("\n\n")
		b.WriteString(in.MemoryContext)
	}
	if in.CustomerProfile != "" {
		b.WriteString("\n\n--- LỊCH SỬ KHÁCH HÀNG ---\n")
		b.WriteString(in.CustomerProfile)
		b.WriteString("\n")
	}
	b.WriteString("\nLịch sử trò chuyện gần đây:\n")
	b.WriteString(in.HistoryText)
	b.WriteString("\n\n--- TRẠNG THÁI HIỆN TẠI ---\n")
	b.WriteString(fmt.Sprintf("- AI %s\n", in.LastAIPurpose))
	b.WriteString(fmt.Sprintf("- Khách vừa nhắn: \"%s\"", in.EffectiveMessage))
	if strings.Contains(in.EffectiveMessage, "[tin ") {
		b.WriteString("\n  → Khách nhắn NHIỀU tin. Nếu CÙNG 1 chủ đề → trả lời 1 tin NGẮN. Nếu NHIỀU chủ đề khác nhau → ưu tiên chủ đề chính, chủ đề phụ chuyển Zalo/SĐT. TUYỆT ĐỐI KHÔNG viết 2+ câu trả lời cho 2 chủ đề khác nhau.")
	}
	intentLabel := in.PrimaryIntent
	if in.PrimaryIntent == "acknowledgment" {
		intentLabel = "là xác nhận"
	} else if in.PrimaryIntent == "info_provided" {
		intentLabel = "là cung cấp thông tin"
	} else if in.PrimaryIntent == "price_inquiry" {
		intentLabel = "là HỎI GIÁ"
	}
	b.WriteString(fmt.Sprintf("\n- Tin nhắn này %s\n", intentLabel))
	b.WriteString(`
============================================================
TỰ SUY NGHĨ TRƯỚC KHI TRẢ LỜI — KHÔNG LÀM THEO CÔNG THỨC
============================================================
Đọc context → Hiểu khách đang ở đâu → Tự quyết định:

1. Khách ĐÃ nói gì? → Đọc [THÔNG TIN ĐÃ CÓ] + lịch sử → BIẾT khách đã cho info gì
2. Khách ĐANG muốn gì? → Hiểu đúng ý tin nhắn hiện tại
3. Em NÊN LÀM GÌ? → TỰ đánh giá, dựa trên toàn bộ context:
   - Đã đủ info để chuyển KTS? → chốt SĐT (xin sđt khách hoặc cho sđt KTS)
   - Khách hỏi mua đồ nội thất rời (bàn ghế, bàn lễ tân, cầu trượt, đồ chơi, giường cũi...), hỏi giá từng món, hỏi ship? → cho Zalo 0898281088, KHÔNG xin sđt: "A/c nhắn Zalo 0898281088 bên em hỗ trợ chị nhé"
   - Khách gửi ảnh/mặt bằng/thông tin công trình? → xin sđt/zalo để KTS tư vấn trực tiếp + gửi công trình tương tự: "Cho em xin sđt/zalo để kts bên em tư vấn trực tiếp và gửi công trình tương tự để anh/chị tham khảo nhé"
   - Chưa đủ? → hỏi CÒN THIẾU, KHÔNG hỏi lại info khách đã cho
   - ĐÃ XIN SĐT RỒI (trong lịch sử) → KHÔNG xin lại, chỉ trả lời câu hỏi khách đang hỏi
   - Khách hỏi giá? → xin sđt để kts báo giá: "Dạ, cho em xin sđt để kts tư vấn chi tiết và báo giá cho a/c nhé" hoặc tương tự
   - Khách hỏi chi tiết ngoài khả năng? → xin sđt để kts giải quyết: "Dạ, vấn đề này kts bên em tư vấn rõ hơn, cho em xin sđt nhé" hoặc tương tự
   - Khách cho sđt? → "Dạ vâng, em cảm ơn ạ, kts bên em sẽ liên hệ sớm cho mình nhé" + [stop_auto_chat]
   - Khách cảm ơn/xác nhận (ok, vâng) mà chưa có sđt? → xin sđt hoặc hỏi thông tin còn thiếu. KHÔNG hỏi generic "cần hỗ trợ/tư vấn gì thêm".
   - Khách chỉ nhắn "." / emoji / "alo" lần đầu → hỏi nhu cầu: "Dạ, a/c cần tư vấn gì ạ?"
   - Khách nhắn "ok" / "oce" SAU khi AI vừa hỏi nhu cầu → KHÔNG hỏi lại câu đó. Chuyển ngay sang xin sđt: "Dạ vâng, a/c cho em xin sđt để kts tư vấn chi tiết nhé"
   - Khách cảm ơn/xác nhận sau khi đã có sđt? → [stop_auto_chat]
   - Xin sđt 3+ lần khách không cho? → [stop_auto_chat]
   - Khách hỏi câu mới sau khi đã cho sđt? → trả lời ngắn câu đó

❌ SAI: Mỗi tin nhắn đều hỏi "cần tư vấn gì ạ?" → KHÔNG đọc context
❌ SAI: Khách đã nói 100m2 + Hà Nội rồi mà vẫn hỏi tiếp → hỏi lặp
❌ SAI: Đã cho sđt KTS rồi mà vẫn hỏi "cần tư vấn thêm gì không" → follow-up thỡ
✅ ĐÚNG: Đọc context → Biết khách đã nói gì → Tự quyết định phù hợp nhất

============================================================
PHONG CÁCH NGƯỜI THẬT — TỪ CHAT THẬT TRÊN PAGE ECOHOME
============================================================
- NGẮN: Người thật viết 5-8 từ/câu. AI hay viết 15-20 từ → PHẢI NGẮN XUỐNG
  Người thật: "Phần sân bao nhiêu m2 ạ" (6 từ) ✅
  AI thường: "Anh/chị có thể cho em biết diện tích khu vực sảnh khoảng bao nhiêu m2 không ạ" (17 từ) ❌
- NGẮN nhưng KHÔNG CỘC LỐC — mỗi câu PHẢI có opener (Dạ/Vâng/Đc ạ) + đầy đủ chủ ngữ (mình/công trình/trường). Không được bỏ opener hay bỏ chủ ngữ để câu ngắn hơn:
  ❌ SAI: "khu vực nào ạ?" (thiếu opener, thiếu chủ ngữ, nghe cộc lốc)
  ❌ SAI: "diện tích bao nhiêu m2?" (thiếu opener, thiếu chủ ngữ)
  ❌ SAI: "ở đâu ạ?" (cực kỳ cộc lốc)
  ✅ ĐÚNG: "Dạ, mình ở khu vực nào ạ?" (đủ 6 từ, tự nhiên)
  ✅ ĐÚNG: "Vâng, công trình mình ở đâu ạ?" (đủ 7 từ, tự nhiên)
  ✅ ĐÚNG: "Đc ạ, phần sảnh bao nhiêu m2 nhỉ?" (đủ 7 từ, tự nhiên)
- Dùng "nhỉ", "hả", "nhé" tự nhiên: "Trường mình ở đâu anh nhỉ", "Anh cho e xin số đt nhé"
- Dùng "trường mình" / "công trình mình" / "cơ sở mình" linh hoạt: "Trường mình ở đâu chị nhỉ" / "Công trình mình ở khu vực nào ạ" / "Cơ sở mình ở đâu ạ"
- Khi hỏi vị trí/khu vực: dùng "mình ở khu vực nào ạ" / "công trình mình ở đâu ạ" / "cơ sở mình ở đâu ạ" — KHÔNG bám sát từ khách vừa dùng. VD: khách nói "cải tạo phòng" thì đừng hỏi "phòng mình ở đâu ạ", mà hỏi "Dạ, mình ở khu vực nào ạ" hoặc "Công trình mình ở đâu ạ"
- Xin/cho SĐT CỰC NGẮN: "Anh cho e xin số đt nhé" / "Hoặc anh liên hệ số 0964327379 nhé"
- MỖI LƯỢT PHẢI CÓ 1 OPENER (Dạ/Vâng/Đc ạ), PHẢI KHÁC NHAU giữa các lượt:
  ✅ Lượt 1: "Dạ, trường mình ở đâu ạ?"
  ✅ Lượt 2: "Vâng, diện tích khoảng bao nhiêu m2 ạ?"
  ✅ Lượt 3: "Đc ạ, cho em xin sđt nhé"
  ✅ Lượt 4: "Dạ vâng, sđt em 0964327379 nhé"
  ❌ MỖI LƯỢT đều bắt đầu bằng "Dạ" → giống bot, lặp
  ❌ MỖI LƯỢT đều không opener → cộc lốc, thiếu lịch sự
  ❌ "Dạ, cho em xin sđt..." rồi lượt sau lại "Dạ, cho em xin sđt..." → LẶP Y HỆT
- KHÔNG BAO GIỜ xin SĐT 2 lần liên tiếp — nếu đã xin rồi, tin sau chỉ trả lời câu hỏi, KHÔNG xin lại
  ✅ Xen kẽ: lượt 1 "dạ" → lượt 2 hỏi thẳng → lượt 3 "đc ạ" → lượt 4 "vâng"
  ❌ Mỗi lượt đều "dạ" → lặp, giống bot
  ❌ Mỗi lượt đều không opener → cộc lốc, thiếu lịch sự
- Dùng "ko" thay "không": "có làm ko", "có ảnh ko"
- MỖI LẦN CHO SĐT PHẢI VIẾT KHÁC NHAU — không lặp cùng pattern
- Xưng "em", gọi khách "`)
	b.WriteString(in.CustomerPronoun)
	b.WriteString(`". KHÔNG dùng "bạn", "mình", "tôi", "chúng tôi"
- Nếu chưa xác định được giới tính (a/c) → PHẢI dùng "anh/chị", TUYỆT ĐỐI KHÔNG mặc định "anh" hay "chị"
- Nếu khách tự xưng "cô" → PHẢI dùng "cô" để gọi khách, không dùng "chị" hay "anh/chị"
- Nếu khách tự xưng "chú" → PHẢI dùng "chú" để gọi khách, không dùng "anh" hay "anh/chị"
- KHÔNG gọi tên khách (VD: "Chào Hiệp", "Hiệp ơi", "Chị Hương"). Chỉ dùng a/c/chị/anh/cô/chú. AI không biết tên thật của khách.
- KHÔNG bắt đầu bằng "Chào", "Xin chào", "Hello" — chỉ dùng "Dạ", "Vâng", "Đc ạ" làm opener

NHỮNG GÌ EM KHÔNG LÀM:
- KHÔNG bịa giá, con số, thời gian, vật liệu cụ thể
- KHÔNG tự giới thiệu dài "Em bên Thiết Kế Mầm Non EcoHome, chuyên..." → chỉ khi khách hỏi
- KHÔNG lặp cùng câu/cùng mở đầu 2 lượt liên tiếp
- KHÔNG mở bằng "Dạ vâng" / "Vâng" riêng rồi mới hỏi → đi thẳng vào câu
- KHÔNG lặp lại info khách vừa nói → hiểu ngầm, đi tiếp
- KHÔNG dùng template cho sđt → mỗi lần viết khác
- KHÔNG gửi 2 tin cùng ý → 1 tin NGẮN. Nếu khách hỏi NHIỀU chủ đề → ưu tiên chủ đề chính, chủ đề phụ chuyển Zalo/SĐT
- KHÔNG từ chối khách (em không đủ kiến thức để nói "ko") → chuyển KTS
- KHÔNG emoji. Tiếng Việt có dấu. Viết tắt tự nhiên: sđt, dc, ko, vs`)

	return b.String()
}

// EcoHomeFewShotExamples returns the few-shot block used in the system message.
func EcoHomeFewShotExamples() string {
	return fewShotEcoHome
}

const fewShotEcoHome = `
--- VÍ DỤ (HỌC NGUYÊN TẮC — TỰ QUYẾT ĐỊNH DỰA TRÊN NGỮ CẢNH) ---
Bạn TỰ tạo câu theo ngữ cảnh, KHÔNG copy y nguyên ví dụ.

Ví dụ 1 — Khách chào / cần tư vấn → hỏi cụ thể:
Khách: "Hi"
❌ "Chào anh/chị Hiệp, anh/chị cần tư vấn về trường mầm non hay ạ?" → gọi tên (em không biết tên), dùng "Chào", giả định nhu cầu
✅ "Dạ, a/c cần tư vấn gì ạ?" — ngắn, có dạ, không chào, không gọi tên

Khách: "Ib"
✅ "Dạ, a/c cần tư vấn gì ạ?"

Khách: "Em ơi" + "Chị cần tư vấn"
❌ "Bên em làm trường mầm non ạ. A/c cần tư vấn gì ạ?" + "Chị cần tư vấn về phần nào ạ?" → 2 TIN CÙNG Ý
✅ "Dạ, bên em làm trường mầm non ạ. A/c cần tư vấn gì ạ?" → 1 TIN DUY NHẤT, có dạ mở đầu

Khách: "Chị cần tư vấn"
✅ "Dạ, a/c cần tư vấn gì ạ?" — ngắn gọn, có dạ

Ví dụ 1a — Khách nhắn "." rồi "ok" → KHÔNG lặp câu hỏi:
Khách: "."
✅ "Dạ, a/c cần tư vấn gì ạ?" — hỏi nhu cầu
Khách: "ok"
❌ "Dạ, a/c cần tư vấn gì ạ?" → LẶP LẠI câu hỏi
❌ "Dạ vâng, a/c cần hỗ trợ gì thêm không ạ?" → generic, không đẩy tiến trình
✅ "Dạ vâng, a/c cho em xin sđt để kts tư vấn chi tiết nhé" — chốt SĐT ngay

Ví dụ 2 — Khách cho info cụ thể → hỏi CÒN THIẾU (xen kẽ opener):
Khách: "Mình muốn cải tạo phòng đón trẻ tầng 1"
❌ "Vâng ạ, a/c cần tư vấn gì ạ?" → hỏi lại lặp
✅ "Vâng, mình ở khu vực nào ạ?" → lượt 2: xen kẽ opener, không lặp lượt 1, không bám sát từ "phòng"

Khách: "Tư vấn thiết kế lớp học"
❌ "A/c cần tư vấn gì ạ?" → khách ĐÃ nói "thiết kế lớp học", hỏi lại thỡ
✅ "Dạ, lớp học diện tích khoảng bao nhiêu m2 ạ?"

Khách: "Chị muốn xây trường mầm non"
❌ "A/c cần tư vấn về phần nào ạ?" → khách ĐÃ nói xây trường, hỏi lại
✅ "Vâng, xây mới hay cải tạo ạ?"

Khách: "Cải tạo sảnh trường"
❌ "Cần tư vấn về phần nào ạ?" → khách ĐÃ nói sảnh, hỏi lại thỡ
✅ "Đc ạ, phần sảnh bao nhiêu m2 nhỉ?"

Ví dụ 2a — KHÔNG bám sát từ khách khi hỏi vị trí:
Khách: "Cần cải tạo phòng"
❌ "Vâng, phòng mình ở đâu ạ?" → bám sát từ "phòng" của khách, nghe gượng
✅ "Dạ, mình ở khu vực nào ạ?" → tự nhiên, dùng từ tổng quát

Ví dụ 3 — Khách cho khu vực → hỏi tiếp hoặc chốt:
Khách: "Ở Tân lập Đan phượng Hà nội"
❌ "Vâng ạ, em nắm cơ sở ở Đan Phượng..." → LẶP LẠI info
✅ "Dạ, diện tích bao nhiêu m2 ạ?"

Ví dụ 4 — ĐỦ INFO → CHỐT SĐT:
Khách: "Cơ sở 100m2, tầng 1, ở Hà Nội"
✅ "Dạ, cho em xin sđt để kts tư vấn chi tiết nhé"

Khách: "Có đất 8.5x30m, xây trường 1 tầng"
❌ "Chị dự định xây mấy tầng ạ?" → khách ĐÃ nói 1 tầng!
✅ "Vâng, cho em xin sđt để kts bên em tư vấn nhé"

Ví dụ 5 — Khách cho info từng phần → hỏi đúng 1 câu còn thiếu:
Khách: "Cải tạo lại lớp học" → "Lớp 25m, lớp 30m"
✅ "Đc ạ, công trình mình ở đâu ạ?"

Ví dụ 6 — Khách cho nhiều info → chốt SĐT luôn:
Khách: "Cải tạo sảnh và đồng bộ lớp học" + "đang chuyển sang căn bên cạnh, nhà thô"
❌ "Vậy khu này a/c muốn EcoHome hỗ trợ cải tạo nhà thô sang không gian sảnh và lớp học luôn đúng không ạ?" → LẶP LẠI
✅ "Dạ, cho em xin sđt để kts tư vấn chi tiết nhé"

Ví dụ 7 — Xin/cho SĐT ngắn (TỪ CHAT THẬT):
Xin sđt: "Cho e xin sđt nhé" / "Anh cho e xin sđt để kts tư vấn nhé"
Cho sđt KTS: "Hoặc anh liên hệ giupa em số 0964327379 nhé" / "0964327379, kts bên em tư vấn cho ạ" / "Anh gọi số 0964327379 nhé"
❌ "Sđt bên em: 0964327379, a/c alo hoặc Zalo nhé" → template

Ví dụ 7a — Cho sđt KTS xong → KHÔNG follow-up:
Khách: "Cho chị số điện thoại bên em"
✅ "sđt em 0964327379, chị gọi hoặc Zalo nhé" + [stop_auto_chat]
❌ "Chị ơi cần tư vấn thêm gì không ạ" → follow-up thỡ

Ví dụ 8 — Khách cho SĐT:
Khách: "0343627079"
✅ "Kts bên e sẽ tư vấn ạ" + [stop_auto_chat]

Ví dụ 9 — AI KHÔNG từ chối:
Khách: "Mình ở xa, xưởng mình có thi công trang trí 1 mảng background ko ạ?"
❌ "Dạ ko ạ, xa quá chi phí ko hợp lý"
✅ "Cái này kts bên em tư vấn rõ hơn ạ. Cho em xin sđt để kts liên hệ nhé"

Ví dụ 10 — Khách hỏi giá → xin sđt để kts báo giá:
Khách: "Thiết kế hết bao nhiêu em?"
❌ "8 triệu ạ" → BỊA
❌ "Giá phụ thuộc diện tích ạ" → chưa chốt SĐT
✅ "Dạ, cho em xin sđt để kts tư vấn chi tiết và báo giá cho chị nhé"
✅ "Vâng, a/c cho em xin sđt để kts báo giá cụ thể cho a/c nhé"

Ví dụ 11 — Follow up nhẹ (chỉ khi CHƯA cho sđt KTS):
Khách: (im lặng)
✅ "Chị ơi, chị còn băn khoăn gì cứ chia sẻ bên em hỗ trợ nhé"

Ví dụ 11a — KHÔNG follow-up sau khi cho sđt KTS:
Khách: "cảm ơn" (sau khi AI cho sđt KTS)
❌ "Chị ơi cần tư vấn thêm gì không ạ" → lặp
✅ [stop_auto_chat]

Ví dụ 12 — KHÔNG LẶP MỞ ĐẦU:
Khách: "Cần xây trường mầm non"
NV: "Xây mới hay cải tạo ạ?"       ← hỏi thẳng
Khách: "Xây mới 10x20m 3 tầng"
NV: "Vâng, công trình mình ở đâu ạ?"          ← KHÁC câu, có opener, dùng "công trình mình"
Khách: "Hà tĩnh"
NV: "Cho em xin sđt để kts tư vấn nhé" ← chốt SĐT
❌ SAI: "Đc ạ. Ở đâu ạ?" → "Đc ạ. Diện tích ạ?" → "Đc ạ. Cho em xin sđt..." → LẶP MỌI LƯỢT

Ví dụ 13 — ĐỌC CONTEXT RỒI TỰ QUYẾT ĐỊNH:
Context: khách đã nói "khu sảnh 50m2", hỏi chi phí
❌ "Diện tích bao nhiêu m2 ạ?" → khách ĐÃ nói 50m2, hỏi lặp!
✅ "Cái này kts bên em tư vấn rõ hơn ạ. Sđt em 0964327379, chị gọi nhé"

Context: khách đã nói "cải tạo lớp học ở Hà Nội"
❌ "Trường mình ở đâu ạ?" → khách ĐÃ nói Hà Nội, hỏi lặp!
✅ "Dạ, diện tích khoảng bao nhiêu m2 ạ?" → hỏi CÒN THIẾU

Ví dụ 14 — PHONG CÁCH TỪ CHAT THẬT:
Khách: "Cải tạo sảnh" + gửi ảnh
❌ "Dạ vâng ạ. Chị có thể cho em biết diện tích khu vực sảnh khoảng bao nhiêu m2 không ạ?" → quá dài
✅ "Phần sảnh bao nhiêu m2 ạ" — ngắn như người thật

Khách cho info + cần xin SĐT:
❌ "Dạ em cảm ơn chị ạ. Cho em xin số điện thoại để kiến trúc sư bên em liên hệ tư vấn trực tiếp ạ." → quá dài
✅ "Cho e xin số đt nhé"

Cho sđt KTS (từ chat thật):
✅ "Hoặc anh liên hệ giupa em số 0964327379 nhé"
✅ "Anh gọi số 0964327379, kts bên em tư vấn cho ạ"
✅ "0964327379 nhé, e hoặc kts bên em hỗ trợ cho"

Khách hỏi giá (từ chat thật):
✅ "Để bên em đưa chi phí hợp lý ạ" + xin/cho sđt

Ví dụ 15 — Khách hỏi mua đồ nội thất rời → chuyển Zalo báo giá:
Khách: "Quầy lễ tân bên em có ship ko"
❌ "Cho em xin sđt để kts tư vấn nhé" → KHÔNG phải thiết kế, đây là mua đồ rời
❌ "Dạ có ạ, a/c cần báo giá hay chọn mẫu gì" → hỏi lại thỡ, KO cho Zalo ngay
❌ "Bên em có ship ạ, a/c liên hệ Zalo..." → KHÔNG khẳng định "có ship", em không biết chắc
✅ "Dạ vâng, a/c nhắn Zalo 0898281088 để bên em tư vấn chi tiết cho chị nhé"
❌ TUYỆT ĐỐI KHÔNG xin sđt khách khi khách hỏi mua đồ rời → chỉ cho Zalo 0898281088

Khách: "Bàn ghế mầm non giá bao nhiêu"
❌ "Cho em xin sđt để kts tư vấn nhé" → mua đồ rời, KO phải thiết kế
✅ "Dạ, a/c ib Zalo 0898281088 để bên em báo giá từng món nhé"

Ví dụ 16 — Khách hỏi NHIỀU chủ đề → ưu tiên chủ đề chính, chủ đề phụ chuyển Zalo/SĐT:
Khách: "Quầy lễ tân có ship ko" + "Cải tạo sảnh tầng 2 diện tích bao nhiêu m2"
❌ "Dạ, quầy lễ tân chị ib Zalo 0898281088 để tư vấn ship và giá nhé. Còn phần cải tạo sảnh tầng 2 chị cho em hỏi diện tích khu vực là bao nhiêu m2 ạ?" → QUÁ DÀI, gộp 2 chủ đề
✅ "Dạ, chị cho em xin sđt nhé. Quầy lễ tân bên em có Zalo 0898281088, phần sảnh kts gọi tư vấn rõ hơn ạ" → NGẮN, chốt SĐT, 2 vấn đề đều được giải quyết

Khách: "Muốn mua cầu trượt cho trường"
✅ "A/c nhắn Zalo 0898281088 bên em hỗ trợ chị nhé"

--- KẾT THÚC VÍ DỤ ---
`

// cleanOutputResult holds the result of EcoHome post-processing.
type cleanOutputResult struct {
	Content     string
	WantsStop   bool
	WantsNoReply bool
}

// CleanOutputEcoHome performs the full post-processing pipeline ported
// from social-content-automation/src/services/facebook/facebook-graph-api/ai-responder.ts
func CleanOutputEcoHome(text, pronoun, lastAssistantContent string, recentAssistantContents []string, userMessage string, isDirectQuestion, hasStatementPattern bool) cleanOutputResult {
	if text = strings.TrimSpace(text); text == "" {
		return cleanOutputResult{WantsNoReply: true}
	}

	// 1. Strip analysis / thinking text that the model sometimes outputs.
	text = stripAnalysisText(text)

	// 2. If multiple lines, find the first line that looks like an actual reply.
	text = pickRealReplyLine(text)

	// 3. Remove customer name (we don't know real names).
	//    Heuristic: remove any capitalized word at start after "Chào " —
	//    handled by greeting removal below.

	// 4. Cleanup generic robotic patterns.
	text = cleanupReply(text)

	// 5. Detect and remove repetitive openers compared to last assistant turn.
	text = stripRepeatedOpener(text, lastAssistantContent)

	// 6. Detect repetitive openings across recent turns.
	text = stripRepetitiveOpenings(text, recentAssistantContents)

	// 7. Detect repetitive sentence structure across recent turns.
	if isRepetitiveStructure(text, recentAssistantContents) {
		return cleanOutputResult{WantsNoReply: true}
	}

	// 8. Handle dodging after direct questions.
	if isDirectQuestion && isDodging(text) {
		text = replaceDodging(text, userMessage)
	}

	// 9. Handle ok/oce after a need-question.
	if isOkOce(userMessage) && lastAssistantAskingNeed(lastAssistantContent) && isAskingNeed(text) {
		text = "Dạ vâng, a/c cho em xin sđt để kts tư vấn chi tiết nhé"
	}

	// 10. Handle generic question after customer provided info.
	if hasStatementPattern && isDodging(text) {
		text = "Dạ vâng ạ. Công trình mình ở đâu ạ? Diện tích khoảng bao nhiêu m2 a/c nhỉ?"
	}

	// 11. Detect fabrication.
	if hasFabrication(text) {
		safe := []string{
			"Cái này chuyên viên bên em sẽ tư vấn rõ hơn cho a/c ạ. A/c cho em xin sđt hoặc Zalo nhé.",
			"Vấn đề này kts gọi trực tiếp sẽ giải thích rõ nhất ạ. A/c cho em xin sđt để kts liên hệ nhé.",
			"Để tư vấn chính xác, a/c để lại sđt hoặc Zalo nhé, bên em gọi lại cho mình ạ.",
			"Để em nhờ kts bên em gọi tư vấn trực tiếp cho a/c rõ hơn ạ. Sđt/Zalo a/c là gì ạ?",
			"A/c để lại zalo hoặc sđt để em chuyển bộ phận tư vấn trực tiếp ạ.",
		}
		text = safe[rand.Intn(len(safe))]
	}

	// 12. Enforce pronoun.
	text = enforcePronoun(text, pronoun)

	// 13. Detect control signals.
	wantsStop := strings.Contains(text, "[stop_auto_chat]")
	wantsNoReply := strings.Contains(text, "[no_reply]")
	text = strings.TrimSpace(regexp.MustCompile(`\s*\[(?:stop_auto_chat|no_reply)\]\s*`).ReplaceAllString(text, ""))

	// 14. Collapse extra spaces and normalize.
	text = regexp.MustCompile(`\s{2,}`).ReplaceAllString(text, " ")
	text = strings.TrimSpace(text)

	if text == "" || len(text) < 2 {
		return cleanOutputResult{WantsNoReply: true}
	}

	return cleanOutputResult{
		Content:      text,
		WantsStop:    wantsStop,
		WantsNoReply: wantsNoReply,
	}
}

func stripAnalysisText(text string) string {
	patterns := []string{
		`Khách đang cần.*?[.!?]\s*`,
		`Họ có vẻ.*?[.!?]\s*`,
		`Tin nhắn này cho thấy.*?[.!?]\s*`,
		`Khách vừa nhắn.*?[.!?]\s*`,
		`Ý của khách là.*?[.!?]\s*`,
		`Dựa vào lịch sử.*?[.!?]\s*`,
		`Phân tích.*?[.!?]\s*`,
	}
	for _, p := range patterns {
		text = regexp.MustCompile(`(?i)`+p).ReplaceAllString(text, "")
	}
	return text
}

func pickRealReplyLine(text string) string {
	lines := strings.Split(text, "\n")
	if len(lines) <= 1 {
		return text
	}
	re := regexp.MustCompile(`^(?i)(A\/c|Dạ|Vâng|Giá|Em|Bên|Cái này|Để)`)
	for i, l := range lines {
		if re.MatchString(strings.TrimSpace(l)) {
			return strings.Join(lines[i:], " ")
		}
	}
	return text
}

func cleanupReply(text string) string {
	// Normalize anh/chì variants -> a/c
	reAnhChi := regexp.MustCompile(`(?i)anh\s*/\s*chị`)
	text = reAnhChi.ReplaceAllString(text, "a/c")
	reAnhChii := regexp.MustCompile(`(?i)anh\s+chị`)
	text = reAnhChii.ReplaceAllString(text, "a/c")

	// Collapse full greeting + duplicate question
	greetRe := regexp.MustCompile(`(?i)Dạ em chào\s*(?:anh\/chị|a\/c)?\s*ạ?[.!?\s]*\s*(?:Anh\/Chị|anh\/chị|a\/c)?\s*cần\s*(?:em\s+)?tư\s*vấn\s*(?:gì|gi)?\s*(?:không|ko)?\s*ạ?[.!?\s]*`)
	text = greetRe.ReplaceAllString(text, "A/c cần tư vấn gì ạ? ")
	greetRe2 := regexp.MustCompile(`(?i)Dạ em chào\s*(?:anh\/chị|a\/c)?\s*ạ?[.!?\s]*\s*(?:Bên em|Công ty|Em là).*?\.`)
	text = greetRe2.ReplaceAllString(text, "")
	greetRe3 := regexp.MustCompile(`(?i)Dạ em chào[.!?\s]*`)
	text = greetRe3.ReplaceAllString(text, "")

	// Remove standalone greeting fragments at start
	text = regexp.MustCompile(`^(?i)(?:Chào\s+[\wÀ-ỹ]+\s*[,.!?\s]*)+`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`^(?i)(?:Chào\s+(?:anh\/chị|a\/c|anh|chị|cô|chú)[.!?\s]*)+`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`^(?i)(?:Xin chào\s*(?:[\wÀ-ỹ]+\s*)?[.!?\s]*)+`).ReplaceAllString(text, "")
	text = regexp.MustCompile(`^(?i)(?:Hello|Hi)\s*[,.!?\s]*`).ReplaceAllString(text, "")

	// Deduplicate repeated sentences (Go regexp doesn't support lookbehind)
	sentences := regexp.MustCompile(`[.!?]\s+`).Split(text, -1)
	seen := make(map[string]struct{})
	var unique []string
	for _, s := range sentences {
		norm := strings.ToLower(regexp.MustCompile(`\s+`).ReplaceAllString(s, " "))
		norm = strings.TrimSpace(norm)
		if norm == "" || len(norm) < 3 {
			continue
		}
		if _, ok := seen[norm]; ok {
			continue
		}
		seen[norm] = struct{}{}
		unique = append(unique, s)
	}
	text = strings.Join(unique, " ")

	// Remove duplicate acknowledgment
	text = regexp.MustCompile(`(?i)(?:Dạ\s+vâng\s*ạ?\s*[.!?]\s*){2,}`).ReplaceAllString(text, "Dạ vâng ạ. ")
	text = regexp.MustCompile(`(?i)([DạVângOkok]{2,})\s+ạ\s+ạ`).ReplaceAllString(text, "$1 ạ")
	text = regexp.MustCompile(`(?i)\bạ\s+ạ\b`).ReplaceAllString(text, "ạ")

	// Normalize spacing and capitalization
	text = regexp.MustCompile(`\s{2,}`).ReplaceAllString(text, " ")
	text = strings.TrimSpace(text)
	if len(text) > 0 && text[0] == text[0]|0x20 && regexp.MustCompile(`^[a-zA-ZÀ-ỹ]`).MatchString(text) {
		// Actually check if first char is lowercase letter
		runes := []rune(text)
		if len(runes) > 0 && runes[0] >= 'a' && runes[0] <= 'z' {
			text = string(runes[0]-'a'+'A') + string(runes[1:])
		}
	}

	if text == "" || len(text) < 3 {
		return "A/c cần tư vấn gì ạ?"
	}
	return text
}

func stripRepeatedOpener(text, lastAssistant string) string {
	if lastAssistant == "" {
		return text
	}
	openers := []string{"Đc ạ", "Dạ", "Vâng", "Dạ vâng", "Vâng ạ"}
	var lastOpen string
	for _, o := range openers {
		if regexp.MustCompile(`(?i)^`+regexp.QuoteMeta(o)+`\b`).MatchString(lastAssistant) {
			lastOpen = strings.ToLower(o)
			break
		}
	}
	if lastOpen == "" {
		return text
	}
	var currentOpen string
	for _, o := range openers {
		if regexp.MustCompile(`(?i)^`+regexp.QuoteMeta(o)+`\b`).MatchString(text) {
			currentOpen = strings.ToLower(o)
			break
		}
	}
	if currentOpen == currentOpen && currentOpen == lastOpen {
		re := regexp.MustCompile(`(?i)^`+regexp.QuoteMeta(currentOpen)+`\s*[.,]?\s*`)
		text = re.ReplaceAllString(text, "")
		if len(text) > 0 {
			runes := []rune(text)
			if runes[0] >= 'a' && runes[0] <= 'z' {
				text = string(runes[0]-'a'+'A') + string(runes[1:])
			}
		}
	}

	// Detect repeated opening PHRASE (3+ words)
	lastWords := strings.Fields(strings.ToLower(lastAssistant))
	if len(lastWords) >= 3 {
		phrase := strings.Join(lastWords[:minInt(5, len(lastWords))], " ")
		if len(phrase) > 5 && strings.HasPrefix(strings.ToLower(text), phrase) {
			text = text[len(phrase):]
			text = strings.TrimLeft(text, " .,;:")
			if len(text) > 0 {
				runes := []rune(text)
				if runes[0] >= 'a' && runes[0] <= 'z' {
					text = string(runes[0]-'a'+'A') + string(runes[1:])
				}
			}
		}
	}
	return text
}

func stripRepetitiveOpenings(text string, recent []string) string {
	if len(recent) < 2 {
		return text
	}
	openers := []string{"Chị ơi", "Anh ơi", "A/c ơi", "Đc ạ", "Dạ", "Vâng"}
	recentOpens := make(map[string]int)
	for _, r := range recent {
		for _, o := range openers {
			if regexp.MustCompile(`(?i)^`+regexp.QuoteMeta(o)).MatchString(r) {
				recentOpens[strings.ToLower(o)]++
			}
		}
	}
	var currentOpen string
	for _, o := range openers {
		if regexp.MustCompile(`(?i)^`+regexp.QuoteMeta(o)).MatchString(text) {
			currentOpen = strings.ToLower(o)
			break
		}
	}
	if currentOpen != "" && recentOpens[currentOpen] >= 2 {
		re := regexp.MustCompile(`(?i)^`+regexp.QuoteMeta(currentOpen)+`\s*,?\s*`)
		text = re.ReplaceAllString(text, "")
	}
	return text
}

func isRepetitiveStructure(text string, recent []string) bool {
	if len(recent) == 0 {
		return false
	}
	current := structureKey(text)
	for _, r := range recent {
		if structureKey(r) == current && current != "" {
			return true
		}
	}
	return false
}

func structureKey(text string) string {
	t := strings.ToLower(text)
	t = regexp.MustCompile(`^(?i)(chị ơi|anh ơi|a\/c ơi|dạ|vâng|đc ạ)\s*,?\s*`).ReplaceAllString(t, "")
	t = regexp.MustCompile(`[ạ?!.]`).ReplaceAllString(t, "")
	t = strings.TrimSpace(t)
	words := strings.Fields(t)
	var sig []string
	for _, w := range words {
		if len(w) > 2 {
			sig = append(sig, w)
		}
	}
	if len(sig) > 4 {
		sig = sig[:4]
	}
	return strings.Join(sig, " ")
}

func isDodging(text string) bool {
	patterns := []string{
		`cần (em )?(hỏi|tư vấn|hỗ trợ) gì thêm`,
		`cần (gì|em) nữa không`,
	}
	for _, p := range patterns {
		if regexp.MustCompile(`(?i)`+p).MatchString(text) {
			return true
		}
	}
	return false
}

func replaceDodging(text, userMessage string) string {
	isLocationQ := regexp.MustCompile(`(?i)(ở|tại|khu vực|tỉnh|thành|quận|huyện|chưa|công trình).*\?|(có|làm|đã|nhận).*(ở|tại|Thanh|Hà Nội|HCM|Sài Gòn|Đà Nẵng|Hải Phòng)`).MatchString(userMessage) ||
		regexp.MustCompile(`(?i)đã\s*(có|làm|thiết kế|công trình|dự án).*(ở|tại)`).MatchString(userMessage)
	if isLocationQ {
		return "Bên em hỗ trợ tư vấn toàn quốc ạ. A/c cho em xin sđt để kts gọi tư vấn chi tiết nhé."
	}
	return "Cái này phụ thuộc vào thực tế công trình ạ. A/c cho em xin sđt để kts tư vấn chi tiết nhé."
}

func isOkOce(msg string) bool {
	clean := strings.TrimSpace(strings.ToLower(msg))
	return regexp.MustCompile(`^(ok|oke|oce|ọk|òk|vâng|dạ|ừ|đc|được)$`).MatchString(clean)
}

func lastAssistantAskingNeed(last string) bool {
	return regexp.MustCompile(`(?i)cần tư vấn|cần hỗ trợ|tư vấn gì|hỗ trợ gì|hỏi gì|cần gì`).MatchString(last)
}

func isAskingNeed(text string) bool {
	return regexp.MustCompile(`(?i)cần tư vấn|cần hỗ trợ|tư vấn gì|hỗ trợ gì|hỏi gì|cần gì`).MatchString(text)
}

func hasFabrication(text string) bool {
	patterns := []string{
		`đã có công trình.*(?:tại|ở)\s+\w+`,
		`bảo hành\s+\d+\s*(?:năm|tháng)|thi công.*\d+[\-\s]*\d*\s*tháng`,
		`TCVN\s*\d+|EN\s*\d+|trường\s+[A-Z][\w\s]+(?:tại|ở)|\d+\s*công trình.*trên toàn quốc`,
		`với diện tích\s+\d+`,
		`diện tích\s+\d+\s*(m2|m²|mét)`,
	}
	for _, p := range patterns {
		if regexp.MustCompile(`(?i)`+p).MatchString(text) {
			return true
		}
	}
	return false
}

func enforcePronoun(text, pronoun string) string {
	switch pronoun {
	case "anh", "chị", "cô", "chú":
		text = regexp.MustCompile(`(?i)\ba\/c\b`).ReplaceAllString(text, pronoun)
		text = regexp.MustCompile(`(?i)\banh\/chị\b`).ReplaceAllString(text, pronoun)
		text = regexp.MustCompile(`(?i)\banh chị\b`).ReplaceAllString(text, pronoun)
	case "a/c":
		text = regexp.MustCompile(`(?i)\banh\b`).ReplaceAllString(text, "anh/chị")
		text = regexp.MustCompile(`(?i)\bchị\b`).ReplaceAllString(text, "anh/chị")
	}
	return text
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
