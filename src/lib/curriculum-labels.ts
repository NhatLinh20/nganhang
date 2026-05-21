// src/lib/curriculum-labels.ts
// Tên chương, bài, dạng từ mucluc-ID.txt

export const CHAPTER_NAMES: Record<number, Record<string, Record<number, string>>> = {
  10: {
    D: {
      1: 'Ch.1 Mệnh đề. Tập hợp',
      2: 'Ch.2 BPT và hệ BPT bậc nhất hai ẩn',
      3: 'Ch.3 Hàm số bậc hai và đồ thị',
      6: 'Ch.6 Thống kê',
      7: 'Ch.7 BPT bậc 2 một ẩn',
      8: 'Ch.8 Đại số tổ hợp',
      0: 'Ch.10 Xác suất',
    },
    H: {
      4: 'Ch.4 Hệ thức lượng trong tam giác',
      5: 'Ch.5 Véctơ (chưa xét tọa độ)',
      9: 'Ch.9 Phương pháp toạ độ trong mặt phẳng',
    },
    C: {
      1: 'CĐ1 Hệ PT bậc nhất 3 ẩn và ứng dụng',
      2: 'CĐ2 Phương pháp quy nạp toán học',
    },
  },
  11: {
    D: {
      1: 'Ch.1 HS lượng giác và PT lượng giác',
      2: 'Ch.2 Dãy số. Cấp số cộng. Cấp số nhân',
      3: 'Ch.3 Giới hạn. Hàm số liên tục',
      5: 'Ch.5 Số đặc trưng xu thế trung tâm (ghép nhóm)',
      6: 'Ch.6 Hàm số mũ và hàm số lôgarít',
      7: 'Ch.7 Đạo hàm',
      9: 'Ch.9 Xác suất',
    },
    H: {
      4: 'Ch.4 Đường thẳng, mặt phẳng. Quan hệ song song',
      8: 'Ch.8 Quan hệ vuông góc trong không gian',
    },
    C: {
      1: 'CĐ1 Phép biến hình phẳng',
      2: 'CĐ2 Lý thuyết đồ thị',
      3: 'CĐ3 Một số yếu tố vẽ kỹ thuật',
    },
  },
  12: {
    D: {
      1: 'Ch.1 Ứng dụng đạo hàm để khảo sát hàm số',
      3: 'Ch.3 Số đặc trưng mức độ phân tán (ghép nhóm)',
      4: 'Ch.4 Nguyên hàm, tích phân và ứng dụng',
      6: 'Ch.6 Một số yếu tố xác suất',
    },
    H: {
      2: 'Ch.2 Tọa độ véc-tơ trong không gian',
      5: 'Ch.5 PT mặt phẳng, đường thẳng, mặt cầu (Oxyz)',
    },
  },
}

export const LESSON_NAMES: Record<number, Record<string, Record<number, Record<number, string>>>> = {
  10: {
    D: {
      1: { 1: '§1 Mệnh đề', 2: '§2 Tập hợp', 3: '§3 Các phép toán tập hợp' },
      2: { 1: '§1 BPT bậc nhất hai ẩn', 2: '§2 Hệ BPT bậc nhất hai ẩn' },
      3: { 1: '§1 Hàm số và đồ thị', 2: '§2 Hàm số bậc hai' },
      6: { 1: '§1 Số gần đúng. Sai số', 2: '§2 Mô tả và biểu diễn dữ liệu', 3: '§3 Số đặc trưng xu thế trung tâm', 4: '§4 Số đặc trưng mức độ phân tán' },
      7: { 1: '§1 Dấu của tam thức bậc 2', 2: '§2 Giải BPT bậc 2 một ẩn', 3: '§3 PT quy về PT bậc hai' },
      8: { 1: '§1 Quy tắc cộng - quy tắc nhân', 2: '§2 Hoán vị. Chỉnh hợp. Tổ hợp', 3: '§3 Nhị thức Newton' },
      0: { 1: '§1 Không gian mẫu và biến cố', 2: '§2 Xác suất của biến cố' },
    },
    H: {
      4: { 1: '§1 Giá trị lượng giác của góc (0°–180°)', 2: '§2 Định lý sin và định lý côsin', 3: '§3 Giải tam giác và ứng dụng thực tế' },
      5: { 1: '§1 Khái niệm véctơ', 2: '§2 Tổng và hiệu của hai véctơ', 3: '§3 Tích của một số với véctơ', 4: '§4 Tích vô hướng (chưa xét tọa độ)' },
      9: { 1: '§1 Toạ độ của véctơ', 2: '§2 Tích vô hướng (theo tọa độ)', 3: '§3 Đường thẳng trong mặt phẳng toạ độ', 4: '§4 Đường tròn trong mặt phẳng toạ độ', 5: '§5 Ba đường conic trong mặt phẳng toạ độ' },
    },
    C: {
      1: { 1: '§1 Hệ PT bậc nhất 3 ẩn và ứng dụng' },
      2: { 1: '§1 Phương pháp quy nạp toán học' },
    },
  },
  11: {
    D: {
      1: { 1: '§1 Góc lượng giác', 2: '§2 Giá trị lượng giác của một góc lượng giác', 3: '§3 Các công thức lượng giác', 4: '§4 Hàm số lượng giác và đồ thị', 5: '§5 Phương trình lượng giác cơ bản', 6: '§6 [Giảm] PT lượng giác thường gặp' },
      2: { 1: '§1 Dãy số', 2: '§2 Cấp số cộng', 3: '§3 Cấp số nhân' },
      3: { 1: '§1 Giới hạn của dãy số', 2: '§2 Giới hạn của hàm số', 3: '§3 Hàm số liên tục' },
      5: { 1: '§1 Số trung bình và mốt (ghép nhóm)', 2: '§2 Trung vị và tứ phân vị (ghép nhóm)' },
      6: { 1: '§1 Phép tính luỹ thừa', 2: '§2 Phép tính lôgarít', 3: '§3 Hàm số mũ. Hàm số lôgarít', 4: '§4 PT, BPT mũ và lôgarít', 5: '§5 [Giảm] Các phương pháp giải được giảm tải' },
      7: { 1: '§1 Đạo hàm', 2: '§2 Các quy tắc đạo hàm', 3: '§3 Đạo hàm cấp hai' },
      9: { 1: '§1 Biến cố giao và quy tắc nhân xác suất', 2: '§2 Biến cố hợp và quy tắc cộng xác suất' },
    },
    H: {
      4: { 1: '§1 Điểm, đường thẳng và mặt phẳng', 2: '§2 Hai đường thẳng song song', 3: '§3 Đường thẳng và mặt phẳng song song', 4: '§4 Hai mặt phẳng song song', 5: '§5 Hình lăng trụ và hình hộp (xiên)', 6: '§6 Phép chiếu song song' },
      8: { 1: '§1 Hai đường thẳng vuông góc', 2: '§2 Đường thẳng vuông góc với mặt phẳng', 3: '§3 Phép chiếu vuông góc', 4: '§4 Hai mặt phẳng vuông góc', 5: '§5 Khoảng cách', 6: '§6 Góc giữa đường thẳng và mặt phẳng. Góc nhị diện', 7: '§7 Hình lăng trụ đứng. Hình chóp đều. Thể tích' },
    },
    C: {
      1: { 1: '§1 Phép biến hình, phép dời hình', 2: '§2 Phép tịnh tiến', 3: '§3 Phép đối xứng trục', 4: '§4 Phép đối xứng tâm', 5: '§5 Phép quay', 6: '§6 Phép vị tự', 7: '§7 Phép đồng dạng' },
      2: { 1: '§1 Đồ thị', 2: '§2 Đường đi Euler và Harmilton', 3: '§3 Bài toán tìm đường đi ngắn nhất' },
      3: { 1: '§1 Hình biểu diễn của một hình, khối', 2: '§2 Bản vẽ kỹ thuật' },
    },
  },
  12: {
    D: {
      1: { 1: '§1 Sự đồng biến và nghịch biến của hàm số', 2: '§2 Cực trị của hàm số', 3: '§3 Giá trị lớn nhất và giá trị nhỏ nhất', 4: '§4 Đường tiệm cận', 5: '§5 Khảo sát sự biến thiên và vẽ đồ thị hàm số' },
      3: { 1: '§1 Khoảng biến thiên, khoảng tứ phân vị', 2: '§2 Phương sai, độ lệch chuẩn (ghép nhóm)' },
      4: { 1: '§1 Nguyên hàm', 2: '§2 Tích phân', 3: '§3 Ứng dụng thực tế và hình học của tích phân' },
      6: { 1: '§1 Xác suất có điều kiện', 2: '§2 Công thức xác suất toàn phần. Bayes' },
    },
    H: {
      2: { 1: '§1 Véc-tơ và các phép toán véc-tơ trong không gian', 2: '§2 Toạ độ của véc-tơ và các công thức' },
      5: { 1: '§1 Phương trình mặt phẳng', 2: '§2 Phương trình đường thẳng trong không gian', 3: '§3 Phương trình mặt cầu trong không gian' },
    },
  },
}

export const VARIANT_NAMES: Record<number, Record<string, Record<number, Record<number, Record<number, string>>>>> = {
  "10": {
    "D": {
      "0": {
        "1": {
          "1": "Các câu hỏi lý thuyết tổng hợp",
          "2": "Mô tả không gian mẫu, biến cố",
          "3": "Đếm phần tử không gian mẫu, biến cố"
        },
        "2": {
          "1": "Các câu hỏi lý thuyết tổng hợp",
          "2": "Liên quan xúc xắc, đồng tiền (PP liệt kê)",
          "3": "Liên quan việc sắp xếp chỗ",
          "4": "Liên quan việc chọn người",
          "5": "Liên quan việc chọn đối tượng khác",
          "6": "Liên quan hình học",
          "7": "Liên quan việc đếm số",
          "8": "Liên quan bàn tròn hoặc hoán vị lặp",
          "9": "Liên quan vấn đề khác"
        }
      },
      "1": {
        "1": {
          "1": "Xác định mệnh đề, mệnh đề chứa biến",
          "2": "Tính đúng-sai của mệnh đề",
          "3": "Phủ định của một mệnh đề",
          "4": "Mệnh đề kéo theo, mệnh đề đảo, mệnh đề tương đương",
          "5": "Mệnh đề với mọi, tồn tại (và phủ định chúng)",
          "6": "Áp dụng mệnh đề vào suy luận có lí"
        },
        "2": {
          "1": "Tập hợp và phần tử của tập hợp",
          "2": "Tập hợp con. Hai tập hợp bằng nhau",
          "3": "Ký hiệu khoảng, đoạn, nửa khoảng"
        },
        "3": {
          "1": "Giao và hợp của hai tập hợp (rời rạc)",
          "2": "Hiệu và phần bù của hai tập hợp (rời rạc)",
          "3": "Giao và hợp (dùng đoạn, khoảng)",
          "4": "Hiệu và phần bù (dùng đoạn, khoảng)",
          "5": "Toán thực tế ứng dụng của tập hợp"
        }
      },
      "2": {
        "1": {
          "1": "Các khái niệm về BPT bậc nhất hai ẩn",
          "2": "Miền nghiệm của BPT bậc nhất hai ẩn",
          "3": "Toán thực tế về BPT bậc nhất hai ẩn"
        },
        "2": {
          "1": "Các khái niệm về Hệ BPT bậc nhất hai ẩn",
          "2": "Miền nghiệm của Hệ BPT bậc nhất hai ẩn",
          "3": "Toán thực tế về Hệ BPT bậc nhất hai ẩn"
        }
      },
      "3": {
        "1": {
          "1": "Xác định một hàm số",
          "2": "Tập xác định của hàm số",
          "3": "Giá trị của hàm số",
          "4": "Đồ thị của hàm số",
          "5": "Tính đồng biến, nghịch biến",
          "6": "Tính chẵn, lẻ",
          "7": "Toán thực tế về hàm số"
        },
        "2": {
          "1": "Xác định hàm số bậc hai",
          "2": "Bảng biến thiên, tính đơn điệu, max, min",
          "3": "Đồ thị của hàm số bậc hai",
          "4": "Bài toán về sự tương giao",
          "5": "Hàm số chứa dấu giá trị tuyệt đối",
          "6": "Toán thực tế ứng dụng hàm số bậc hai"
        }
      },
      "6": {
        "1": {
          "1": "Tính và ước lượng sai số tuyệt đối, tương đối",
          "2": "Tính và xác định độ chính xác của kết quả",
          "3": "Quy tròn số gần đúng",
          "4": "Viết số gần đúng cho số đúng biết độ chính xác"
        },
        "2": {
          "1": "Đọc và phân tích thông tin trên bảng số liệu",
          "2": "Đọc và phân tích thông tin trên biểu đồ",
          "3": "Số liệu bất thường trên bảng số liệu",
          "4": "Số liệu bất thường trên biểu đồ"
        },
        "3": {
          "1": "Câu hỏi lý thuyết",
          "2": "Số trung bình cộng",
          "3": "Số trung vị",
          "4": "Tứ phân vị",
          "5": "Mốt"
        },
        "4": {
          "1": "Câu hỏi lý thuyết",
          "2": "Khoảng biến thiên, khoảng tứ phân vị",
          "3": "Giá trị bất thường của mẫu số liệu",
          "4": "Phương sai, độ lệch chuẩn của mẫu số liệu"
        }
      },
      "7": {
        "1": {
          "1": "Xác định tam thức bậc 2",
          "2": "Dấu của tam thức bậc 2 và ứng dụng",
          "3": "Bài toán xét dấu biết BXD, đồ thị",
          "4": "Xét dấu biểu thức dạng tích, thương",
          "5": "Toán thực tế ứng dụng dấu tam thức bậc 2"
        },
        "2": {
          "1": "Bất phương trình bậc 2 và ứng dụng",
          "2": "Giải bất phương trình bậc hai biết BXD, đồ thị",
          "3": "Bất phương trình dạng tích, thương",
          "4": "Hệ bất phương trình BPT bậc 2",
          "5": "Bất phương trình chứa căn, | · |",
          "6": "Bài toán có tham số m",
          "7": "Toán thực tế ứng dụng bất phương trình bậc 2 một ẩn"
        },
        "3": {
          "1": "Phương trình căn √(f(x)) = √(g(x)) và mở rộng",
          "2": "Phương trình căn √(f(x)) = g(x) và mở rộng",
          "3": "Phương trình căn thức có tham số",
          "4": "Phương trình căn thức (dạng khác)",
          "5": "Phương trình khác quy về phương trình bậc 2",
          "6": "Toán hình, toán thực tế ứng dụng phương trình quy về bậc 2"
        }
      },
      "8": {
        "1": {
          "1": "Bài toán chỉ sử dụng quy tắc cộng",
          "2": "Bài toán chỉ sử dụng quy tắc nhân",
          "3": "Bài toán kết hợp quy tắc cộng và quy tắc nhân",
          "4": "Bài toán dùng quy tắc bù trừ",
          "5": "Bài toán đếm số tự nhiên",
          "6": "Sơ đồ hình cây"
        },
        "2": {
          "1": "Lý thuyết tổng hợp về P, C, A",
          "2": "Bài toán có biểu thức P, C, A",
          "3": "Bài toán đếm số tự nhiên",
          "4": "Bài toán chọn người",
          "5": "Bài toán chọn đối tượng khác",
          "6": "Bài toán có yếu tố hình học",
          "7": "Bài toán xếp chỗ (không tròn, không lặp)",
          "8": "Hoán vị bàn tròn",
          "9": "Hoán vị lặp"
        },
        "3": {
          "1": "Các câu hỏi lý thuyết tổng hợp",
          "2": "Khai triển một nhị thức Newton",
          "3": "Tìm hệ số, số hạng trong khai triển bằng tam giác Pascal",
          "4": "Tìm hệ số, số hạng trong khai triển",
          "5": "Tính tổng nhờ khai triển nhị thức Newton",
          "6": "Toán tổ hợp có dùng nhị thức Newton"
        }
      }
    },
    "H": {
      "4": {
        "1": {
          "1": "Xét dấu của biểu thức lượng giác",
          "2": "Tính các giá trị lượng giác",
          "3": "Biến đổi, rút gọn biểu thức lượng giác"
        },
        "2": {
          "1": "Bài toán chỉ dùng định lý Sin, Côsin",
          "2": "Bài toán có dùng công thức diện tích",
          "3": "Biến đổi, rút gọn biểu thức",
          "4": "Nhận dạng tam giác"
        },
        "3": {
          "1": "Giải tam giác",
          "2": "Các ứng dụng thực tế"
        }
      },
      "5": {
        "1": {
          "1": "Xác định một véctơ",
          "2": "Xét phương và hướng của các véctơ",
          "3": "Hai véctơ bằng nhau",
          "4": "Hai véctơ đối nhau",
          "5": "Độ dài của một véctơ",
          "6": "Toán thực tế áp dụng véctơ"
        },
        "2": {
          "1": "Tính toán, thu gọn hiệu các véctơ",
          "2": "Tính đúng-sai của 1 đẳng thức véctơ",
          "3": "Tìm điểm nhờ đẳng thức véctơ",
          "4": "Tính độ dài của véctơ tổng, hiệu",
          "5": "Cực trị hình học",
          "6": "Toán thực tế áp dụng tổng hiệu véctơ"
        },
        "3": {
          "1": "Xác định k.v⃗ và độ dài của nó",
          "2": "Biến đổi, thu gọn 1 đẳng thức véctơ",
          "3": "Tìm điểm nhờ đẳng thức véctơ",
          "4": "Sự cùng phương của 2 véctơ và ứng dụng",
          "5": "Phân tích 1 véctơ theo 2 véctơ không cùng phương",
          "6": "Tính độ dài của véctơ tổng, hiệu",
          "7": "Tập hợp điểm",
          "8": "Cực trị hình học",
          "9": "Toán thực tế áp dụng tích 1 số với véctơ"
        },
        "4": {
          "1": "Tích vô hướng, góc giữa 2 véctơ",
          "2": "Tìm góc nhờ tích vô hướng",
          "3": "Đẳng thức về tích vô hướng hoặc độ dài",
          "4": "Điều kiện vuông góc",
          "5": "Các bài toán tìm điểm và tập hợp điểm",
          "6": "Cực trị và chứng minh bất đẳng thức",
          "7": "Toán thực tế áp dụng tích vô hướng"
        }
      },
      "9": {
        "1": {
          "1": "Tọa độ điểm, độ dài đại số của véctơ trên 1 trục",
          "2": "Phép toán véctơ (tổng, hiệu, tích với số) trong Oxy",
          "3": "Tọa độ điểm và véctơ trên hệ trục Oxy",
          "4": "Sự cùng phương của 2 véctơ và ứng dụng",
          "5": "Phân tích một véctơ theo 2 véctơ không cùng phương",
          "6": "Toán thực tế dùng hệ toạ độ"
        },
        "2": {
          "1": "Tích vô hướng, góc giữa 2 véctơ",
          "2": "Tìm góc nhờ tích vô hướng",
          "3": "Đẳng thức về tích vô hướng hoặc độ dài",
          "4": "Điều kiện vuông góc",
          "5": "Các bài toán tìm điểm và tập hợp điểm",
          "6": "Cực trị và chứng minh bất đẳng thức",
          "7": "Toán thực tế, liên môn"
        },
        "3": {
          "1": "Điểm, véctơ, hệ số góc của đường thẳng",
          "2": "Phương trình đường thẳng",
          "3": "Vị trí tương đối giữa hai đường thẳng",
          "4": "Bài toán về góc giữa hai đường thẳng",
          "5": "Bài toán về khoảng cách",
          "6": "Bài toán tìm điểm",
          "7": "Bài toán dùng cho tam giác, tứ giác",
          "8": "Bài toán thực tế, PP tọa độ hóa",
          "9": "Bài toán có dùng PT chính tắc"
        },
        "4": {
          "1": "Tìm tâm, bán kính và điều kiện là đường tròn",
          "2": "Phương trình đường tròn",
          "3": "Phương trình tiếp tuyến của đường tròn",
          "4": "Vị trí tương đối liên quan đường tròn",
          "5": "Toán tổng hợp đường thẳng và đường tròn",
          "6": "Bài toán dùng cho tam giác, tứ giác",
          "7": "Bài toán thực tế, PP tọa độ hóa"
        },
        "5": {
          "0": "Bài toán tổng hợp/thực tế, PP tọa độ hóa 3 đường conic",
          "1": "Xác định các yếu tố của elip",
          "2": "Phương trình chính tắc của elip",
          "3": "Bài toán điểm trên elip",
          "4": "Xác định các yếu tố của hypebol",
          "5": "Phương trình chính tắc của hypebol",
          "6": "Bài toán điểm trên hypebol",
          "7": "Xác định các yếu tố của parabol",
          "8": "Phương trình chính tắc của parabol",
          "9": "Bài toán điểm trên parabol"
        }
      }
    },
    "C": {
      "1": {
        "1": {
          "1": "Các khái niệm về Hệ PT bậc nhất 3 ẩn",
          "2": "Giải Hệ PT bậc nhất 3 ẩn",
          "3": "Toán thực tế ứng dụng Hệ PT bậc nhất 3 ẩn"
        }
      },
      "2": {
        "1": {
          "1": "Quy nạp chứng minh các đẳng thức/công thức/chia hết",
          "2": "Quy nạp chứng minh các bất đẳng thức"
        }
      }
    }
  },
  "11": {
    "D": {
      "1": {
        "1": {
          "1": "Câu hỏi lý thuyết",
          "2": "Chuyển đổi đơn vị độ và radian",
          "3": "Số đo của một góc lượng giác",
          "4": "Độ dài của một cung tròn",
          "5": "Đường tròn lượng giác và ứng dụng",
          "6": "Toán thực tế áp dụng góc lượng giác"
        },
        "2": {
          "1": "Câu hỏi lý thuyết",
          "2": "Xét dấu giá trị lượng giác. Tính giá trị lượng giác của một góc",
          "3": "Biến đổi, rút gọn biểu thức lượng giác; chứng minh đẳng thức lượng giác",
          "4": "Các góc lượng giác có liên quan đặc biệt: bù nhau, phụ nhau, đối nhau, hơn kém nhau π",
          "5": "Toán thực tế áp dụng giá trị của một góc lượng giác"
        },
        "3": {
          "1": "Câu hỏi lý thuyết",
          "2": "Áp dụng công thức cộng",
          "3": "Áp dụng công thức nhân đôi - hạ bậc",
          "4": "Áp dụng công thức biến đổi tích <-> tổng",
          "5": "Kết hợp nhiều công thức lượng giác",
          "6": "Nhận dạng tam giác",
          "7": "Toán thực tế áp dụng công thức lượng giác"
        },
        "4": {
          "1": "Câu hỏi lý thuyết",
          "2": "Tìm tập xác định",
          "3": "Xét tính đơn điệu",
          "4": "Xét tính chẵn, lẻ",
          "5": "Xét tính tuần hoàn, tìm chu kỳ",
          "6": "Tìm tập giá trị và min, max",
          "7": "Bảng biến thiên và đồ thị",
          "8": "Toán thực tế áp dụng hàm số lượng giác"
        },
        "5": {
          "1": "Câu hỏi lý thuyết. Khái niệm phương trình tương đương",
          "2": "Điều kiện có nghiệm",
          "3": "Phương trình cơ bản dùng Radian",
          "4": "Phương trình cơ bản dùng Độ",
          "5": "Phương trình đưa về dạng cơ bản",
          "6": "Toán thực tế áp dụng phương trình lượng giác"
        },
        "6": {
          "1": "Phương trình bậc n theo một hàm số lượng giác",
          "2": "Phương trình đẳng cấp bậc n đối với sinx và cosx",
          "3": "Phương trình bậc nhất đối với sinx và cosx",
          "4": "Phương trình đối xứng, phản đối xứng",
          "5": "Phương trình lượng giác không mẫu mực",
          "6": "Phương trình lượng giác có chứa ẩn ở mẫu số",
          "7": "Phương trình lượng giác có chứa tham số",
          "8": "Toán thực tế áp dụng phương trình lượng giác thường gặp"
        }
      },
      "2": {
        "1": {
          "1": "Câu hỏi lý thuyết",
          "2": "Số hạng tổng quát, biểu diễn dãy số",
          "3": "Tìm số hạng cụ thể của dãy số",
          "4": "Dãy số tăng, dãy số giảm",
          "5": "Dãy số bị chặn",
          "6": "Toán thực tế áp dụng dãy số"
        },
        "2": {
          "1": "Câu hỏi lý thuyết",
          "2": "Nhận diện cấp số cộng, công sai d",
          "3": "Số hạng tổng quát của cấp số cộng",
          "4": "Tìm số hạng cụ thể trong cấp số cộng",
          "5": "Điều kiện để dãy số là cấp số cộng",
          "6": "Tính tổng của cấp số cộng",
          "7": "Toán thực tế áp dụng cấp số cộng"
        },
        "3": {
          "1": "Câu hỏi lý thuyết",
          "2": "Nhận diện cấp số nhân, công bội q",
          "3": "Số hạng tổng quát của cấp số nhân",
          "4": "Tìm số hạng cụ thể trong cấp số nhân",
          "5": "Điều kiện để dãy số là cấp số nhân",
          "6": "Tính tổng của cấp số nhân",
          "7": "Kết hợp cấp số nhân và cấp số cộng",
          "8": "Toán thực tế áp dụng cấp số nhân"
        }
      },
      "3": {
        "1": {
          "1": "Câu hỏi lý thuyết",
          "2": "Phương pháp đặt thừa số chung (lim hữu hạn)",
          "3": "Phương pháp lượng liên hợp (lim hữu hạn)",
          "4": "Giới hạn vô cực",
          "5": "Cấp số nhân lùi vô hạn",
          "6": "Toán thực tế áp dụng giới hạn của dãy số"
        },
        "2": {
          "1": "Câu hỏi lý thuyết",
          "2": "Thay số trực tiếp",
          "3": "PP đặt thừa số chung, kết quả hữu hạn",
          "4": "PP đặt thừa số chung, kết quả vô cực",
          "5": "PP lượng liên hợp, kết quả hữu hạn",
          "6": "PP lượng liên hợp, kết quả vô cực",
          "7": "Giới hạn một bên",
          "8": "Toán thực tế áp dụng giới hạn của hàm số"
        },
        "3": {
          "1": "Câu hỏi lý thuyết",
          "2": "Tính liên tục thể hiện qua đồ thị",
          "3": "Hàm số liên tục tại một điểm",
          "4": "Hàm số liên tục trên khoảng, đoạn",
          "5": "Bài toán phương trình có nghiệm",
          "6": "Toán thực tế áp dụng hàm số liên tục"
        }
      },
      "5": {
        "1": {
          "1": "Câu hỏi lý thuyết",
          "2": "Mẫu số liệu ghép nhóm",
          "3": "Số trung bình",
          "4": "Mốt"
        },
        "2": {
          "1": "Câu hỏi lý thuyết",
          "2": "Trung vị",
          "3": "Tứ phân vị"
        }
      },
      "6": {
        "1": {
          "1": "Tính giá trị của biểu thức chứa lũy thừa",
          "2": "Biến đổi, rút gọn biểu thức chứa lũy thừa",
          "3": "Điều kiện cho luỹ thừa, căn thức",
          "4": "So sánh các lũy thừa"
        },
        "2": {
          "1": "Tính giá trị biểu thức chứa lôgarít",
          "2": "Biến đổi, biểu diễn biểu thức chứa lôgarít",
          "3": "Rút gọn, chứng minh biểu thức lôgarít",
          "4": "Số e và bài toán lãi kép",
          "5": "Toán thực tế áp dụng phép tính lôgarít"
        },
        "3": {
          "1": "Câu hỏi lý thuyết hàm số lũy thừa, mũ, lôgarít",
          "2": "Tập xác định của hàm số",
          "3": "Sự biến thiên và đồ thị của hàm số mũ, lôgarít",
          "4": "So sánh các luỹ thừa và lôgarít",
          "5": "Toán thực tế áp dụng hàm số mũ, lôgarít"
        },
        "4": {
          "1": "Điều kiện có nghiệm",
          "2": "Phương trình mũ, lôgarít cơ bản",
          "3": "Bất phương trình mũ, lôgarít cơ bản",
          "4": "Phương trình mũ, lôgarít đưa về cùng cơ số",
          "5": "Bất phương trình mũ, lôgarít đưa về cùng cơ số",
          "6": "Toán thực tế áp dụng phương trình mũ, lôgarít"
        },
        "5": {
          "1": "Phương pháp đặt ẩn phụ cho PT mũ, lôgarít",
          "2": "Phương pháp lôgarít hóa, mũ cho PT mũ, lôgarít",
          "3": "Phương pháp hàm số, đánh giá cho PT mũ, lôgarít",
          "4": "Hệ PT mũ, lôgarít",
          "5": "Toán thực tế áp dụng phương trình mũ, lôgarít"
        }
      },
      "7": {
        "1": {
          "1": "Tính đạo hàm bằng định nghĩa",
          "2": "Số gia hàm số, số gia biến số",
          "3": "Ý nghĩa Hình học của đạo hàm",
          "4": "Ý nghĩa Vật lý của đạo hàm",
          "5": "Toán thực tế khác áp dụng định nghĩa đạo hàm"
        },
        "2": {
          "1": "Tính đạo hàm",
          "2": "Đẳng thức có y và y′",
          "3": "Tiếp tuyến tại một điểm",
          "4": "Tiếp tuyến biết trước hệ số góc",
          "5": "Tiếp tuyến chưa biết tiếp điểm và hệ số góc",
          "6": "Giới hạn hàm số lượng giác, hàm số mũ, lôgarít",
          "7": "Dùng đạo hàm cho nhị thức Newton",
          "8": "Toán thực tế áp dụng quy tắc đạo hàm"
        },
        "3": {
          "1": "Tính đạo hàm cấp hai",
          "2": "Đẳng thức có y và (y′, y′′)",
          "3": "Toán thực tế và Ý nghĩa Vật lý của đạo hàm cấp hai"
        }
      },
      "9": {
        "1": {
          "1": "Câu hỏi lí thuyết",
          "2": "Xác định và đếm số phần tử biến cố giao",
          "3": "Công thức nhân xác suất cho 2 biến cố độc lập",
          "4": "Tính xác suất biến cố giao bằng sơ đồ hình cây"
        },
        "2": {
          "1": "Câu hỏi lí thuyết",
          "2": "Xác định và đếm số phần tử biến cố hợp",
          "3": "Quy tắc cộng cho hai biến cố xung khắc",
          "4": "Quy tắc cộng cho hai biến cố bất kì",
          "5": "Tính xác suất biến cố hợp bằng sơ đồ hình cây"
        }
      }
    },
    "H": {
      "4": {
        "1": {
          "1": "Câu hỏi lý thuyết",
          "2": "Hình biểu diễn của một hình không gian",
          "3": "Tìm giao tuyến của hai mặt phẳng",
          "4": "Tìm giao điểm của đường thẳng và mặt phẳng",
          "5": "Xác định thiết diện",
          "6": "Ba điểm thẳng hàng, ba đường thẳng đồng quy",
          "7": "Toán thực tế áp dụng điểm, đường thẳng và mặt phẳng"
        },
        "2": {
          "1": "Câu hỏi lý thuyết",
          "2": "Hai đường thẳng song song",
          "3": "Tìm giao tuyến bằng cách kẻ song song",
          "4": "Tìm giao điểm của đường thẳng và mặt phẳng",
          "5": "Xác định thiết diện bằng cách kẻ song song",
          "6": "Ba điểm thẳng hàng",
          "7": "Bài toán quỹ tích và điểm cố định",
          "8": "Toán thực tế áp dụng hai đường thẳng song song"
        },
        "3": {
          "1": "Câu hỏi lý thuyết",
          "2": "Đường thẳng song song với mặt phẳng",
          "3": "Tìm giao tuyến bằng cách kẻ song song",
          "4": "Tìm giao điểm của đường thẳng và mặt phẳng",
          "5": "Xác định thiết diện bằng cách kẻ song song",
          "6": "Ba điểm thẳng hàng",
          "7": "Bài toán quỹ tích và điểm cố định",
          "8": "Toán thực tế áp dụng đường thẳng song song mặt phẳng"
        },
        "4": {
          "1": "Câu hỏi lý thuyết",
          "2": "Hai mặt phẳng song song",
          "3": "Chứng minh đường thẳng song song mặt phẳng",
          "4": "Xác định mặt phẳng đi qua một điểm và song song với một mặt phẳng",
          "5": "Xác định mặt phẳng chứa đường thẳng (hoặc đi qua hai điểm) và song song với một mặt phẳng",
          "6": "Bài toán tổng hợp",
          "7": "Toán thực tế áp dụng hai mặt phẳng song song"
        },
        "5": {
          "1": "Câu hỏi lý thuyết",
          "2": "Bài toán về hình lăng trụ (xiên)",
          "3": "Bài toán về hình hộp (xiên)",
          "4": "Toán thực tế áp dụng hình lăng trụ và hình hộp"
        },
        "6": {
          "1": "Câu hỏi lý thuyết",
          "2": "Hình biểu diễn của một hình không gian",
          "3": "Xác định yếu tố song song",
          "4": "Xác định phương chiếu",
          "5": "Tính tỉ số đoạn thẳng, diện tích qua phép chiếu"
        }
      },
      "8": {
        "1": {
          "1": "Câu hỏi lí thuyết",
          "2": "Xác định hai đường thẳng vuông góc",
          "3": "Tìm góc giữa hai đường thẳng",
          "4": "Toán thực tế áp dụng hai đường thẳng vuông góc"
        },
        "2": {
          "1": "Câu hỏi lí thuyết",
          "2": "Xác định hoặc chứng minh đường thẳng và mặt phẳng vuông góc",
          "3": "Xác định hoặc chứng minh hai đường thẳng vuông góc",
          "4": "Dựng mặt phẳng, tìm thiết diện",
          "5": "Hình chiếu vuông góc của một hình trên mặt phẳng (tìm điểm, tìm đoạn thẳng, tính diện tích)",
          "6": "Toán thực tế áp dụng đường thẳng vuông góc mặt phẳng"
        },
        "3": {
          "1": "Lý thuyết về phép chiếu vuông góc",
          "2": "Hình chiếu vuông góc của đa giác trên mặt phẳng",
          "3": "Các bài toán thực tế áp dụng phép chiếu vuông góc"
        },
        "4": {
          "1": "Câu hỏi lí thuyết",
          "2": "Xác định/chứng minh đường thẳng vuông góc mặt phẳng, mặt phẳng vuông góc",
          "3": "Xác định góc giữa hai mặt phẳng",
          "4": "Dựng mặt phẳng, thiết diện",
          "5": "Nhận dạng và tính toán liên quan các hình thông dụng",
          "6": "Bài toán cho trước góc giữa d và (P)",
          "7": "Toán thực tế áp dụng hai mặt phẳng vuông góc"
        },
        "5": {
          "1": "Câu hỏi lí thuyết",
          "2": "Khoảng cách giữa 2 điểm, từ 1 điểm đến 1 đường thẳng",
          "3": "Khoảng cách từ một điểm đến một mặt phẳng",
          "4": "Khoảng cách giữa hai đường thẳng chéo nhau",
          "5": "Đường vuông góc chung của hai đường thẳng chéo nhau",
          "6": "Toán thực tế áp dụng khoảng cách"
        },
        "6": {
          "1": "Góc giữa đường thẳng và mặt phẳng",
          "2": "Góc nhị diện, góc phẳng nhị diện",
          "3": "Góc giữa 2 mặt phẳng, biết trước góc (d,(P))",
          "4": "Khoảng cách giữa điểm, đường, biết trước góc (d,(P))",
          "5": "Khoảng cách giữa điểm - mặt phẳng, biết trước góc (d,(P))",
          "6": "Khoảng cách giữa 2 đường chéo nhau, biết trước góc (d,(P))",
          "7": "Toán thực tế về góc đường thẳng, mặt phẳng, góc nhị diện"
        },
        "7": {
          "1": "Câu hỏi lí thuyết, công thức",
          "2": "Thể tích khối chóp tam giác",
          "3": "Thể tích khối chóp tứ giác",
          "4": "Thể tích khối lăng trụ tam giác",
          "5": "Thể tích khối lăng trụ tứ giác",
          "6": "Thể tích khối chóp cụt và các khối khác",
          "7": "Tỉ số thể tích",
          "8": "Ứng dụng thể tích tính góc, khoảng cách,. . .",
          "9": "Toán thực tế hình lăng trụ đứng, chóp đều, thể tích"
        }
      }
    },
    "C": {
      "1": {
        "1": {
          "1": "Câu hỏi lý thuyết",
          "2": "Bài toán xác định một phép đặt tương ứng có là phép dời hình hay không?",
          "3": "Xác định ảnh khi thực hiện phép dời hình"
        },
        "2": {
          "1": "Câu hỏi lý thuyết",
          "2": "Tìm ảnh hoặc tạo ảnh khi thực hiện phép tịnh tiến",
          "3": "Ứng dụng phép tịnh tiến"
        },
        "3": {
          "1": "Câu hỏi lý thuyết",
          "2": "Tìm ảnh hoặc tạo ảnh khi thực hiện phép đối xứng trục",
          "3": "Xác định trục đối xứng và số trục đối xứng của một hình",
          "4": "Ứng dụng phép đối xứng trục"
        },
        "4": {
          "1": "Câu hỏi lý thuyết",
          "2": "Tìm ảnh, tạo ảnh khi thực hiện phép đối xứng tâm",
          "3": "Xác định hình có tâm đối xứng",
          "4": "Ứng dụng phép đối xứng tâm"
        },
        "5": {
          "1": "Câu hỏi lý thuyết",
          "2": "Xác định vị trí ảnh của điểm, hình khi thực hiện phép quay cho trước",
          "3": "Tìm tọa độ ảnh của điểm, phương trình của một đường thẳng khi thực hiện phép quay",
          "4": "Ứng dụng phép quay"
        },
        "6": {
          "1": "Câu hỏi lý thuyết",
          "2": "Xác định ảnh, tạo ảnh khi thực hiện phép vị tự",
          "3": "Tìm tâm vị tự của hai đường tròn",
          "4": "Ứng dụng phép vị tự"
        },
        "7": {
          "1": "Câu hỏi lý thuyết",
          "2": "Xác định ảnh, tạo ảnh khi thực hiện phép đồng dạng"
        }
      },
      "2": {
        "1": {
          "1": "Câu hỏi về đỉnh, cạnh của đồ thị",
          "2": "Câu hỏi về bậc của đồ thị",
          "3": "Câu hỏi tổng hợp"
        },
        "2": {
          "1": "Đường đi Euler",
          "2": "Đường đi Harmilton",
          "3": "Câu hỏi tổng hợp"
        },
        "3": {
          "1": "Bài toán tìm đường đi ngắn nhất",
          "2": "Tổng hợp"
        }
      },
      "3": {
        "1": {
          "1": "Lý thuyết về phép chiếu và hình biểu diễn song song",
          "2": "Lý thuyết về phép chiếu vuông góc",
          "3": "Lý thuyết về phép chiếu trục đo",
          "4": "Tổng hợp"
        },
        "2": {
          "1": "Lý thuyết cơ bản về bản vẽ kỹ thuật",
          "2": "Phương pháp biểu diễn bản vẽ kỹ thuật",
          "3": "Tổng hợp"
        }
      }
    }
  },
  "12": {
    "D": {
      "1": {
        "1": {
          "1": "Xét tính đơn điệu của hàm số cho bởi công thức",
          "2": "Xét tính đơn điệu dựa vào bảng biến thiên, đồ thị",
          "3": "Tìm tham số m để hàm số đơn điệu",
          "4": "Ứng dụng tính đơn điệu để chứng minh bất đẳng thức, giải phương trình, bất phương trình, hệ phương trình",
          "5": "Toán thực tế ứng dụng sự đồng biến nghịch biến"
        },
        "2": {
          "1": "Tìm cực trị của hàm số cho bởi công thức",
          "2": "Tìm cực trị dựa vào BBT, đồ thị",
          "3": "Tìm m để hàm số đạt cực trị tại 1 điểm x0 cho trước",
          "4": "Tìm m để hàm số, đồ thị hàm số bậc ba có cực trị thỏa mãn điều kiện",
          "5": "Tìm m để hàm số, đồ thị hàm số trùng phương có cực trị thỏa mãn điều kiện",
          "6": "Tìm m để hàm số, đồ thị hàm số các hàm số khác có cực trị thỏa mãn điều kiện",
          "7": "Toán thực tế ứng dụng cực trị của hàm số"
        },
        "3": {
          "1": "GTLN, GTNN trên đoạn [a; b]",
          "2": "GTLN, GTNN trên khoảng",
          "3": "Sử dụng các đánh giá, bất đẳng thức cổ điển",
          "4": "Ứng dụng GTNN, GTLN trong bài toán phương trình, bất phương trình, hệ phương trình",
          "5": "GTLN, GTNN hàm nhiều biến",
          "6": "Toán thực tế ứng dụng GTLN, GTNN của hàm số"
        },
        "4": {
          "1": "Bài toán xác định các đường tiệm cận của hàm số (không chứa tham số) hoặc biết BBT, đồ thị",
          "2": "Bài toán xác định các đường tiệm cận của hàm số có chứa tham số",
          "3": "Bài toán liên quan đến đồ thị hàm số và các đường tiệm cận",
          "4": "Toán thực tế ứng dụng tiệm cận"
        },
        "5": {
          "1": "Nhận dạng đồ thị",
          "2": "Các phép biến đổi đồ thị",
          "3": "Biện luận số giao điểm dựa vào đồ thị, bảng biến thiên",
          "4": "Sự tương giao của hai đồ thị (liên quan đến tọa độ giao điểm)",
          "5": "Đồ thị của hàm đạo hàm",
          "6": "Phương trình tiếp tuyến của đồ thị hàm số",
          "7": "Điểm đặc biệt của đồ thị hàm số",
          "8": "Toán thực tế ứng dụng khảo sát hàm số"
        }
      },
      "3": {
        "1": {
          "1": "Công thức lý thuyết",
          "2": "Tìm khoảng biến thiên",
          "3": "Tìm khoảng tứ phân vị",
          "4": "Câu hỏi tổng hợp"
        },
        "2": {
          "1": "Công thức lý thuyết",
          "2": "Tìm phương sai, độ lệch chuẩn",
          "3": "Câu hỏi tổng hợp"
        }
      },
      "4": {
        "1": {
          "1": "Công thức lý thuyết",
          "2": "Nguyên hàm cơ bản đa thức, phân thức",
          "3": "Nguyên hàm cơ bản hàm lượng giác",
          "4": "Nguyên hàm cơ bản hàm mũ, luỹ thừa",
          "5": "Phương pháp đổi biến số cơ bản",
          "6": "Toán thực tế áp dụng nguyên hàm"
        },
        "2": {
          "1": "Công thức lý thuyết",
          "2": "Tích phân cơ bản đa thức, phân thức",
          "3": "Tích phân cơ bản hàm lượng giác",
          "4": "Tích phân cơ bản hàm mũ, luỹ thừa",
          "5": "Phương pháp đổi biến số cơ bản",
          "6": "Toán thực tế áp dụng nguyên hàm"
        },
        "3": {
          "1": "Diện tích hình phẳng được giới hạn bởi các đồ thị",
          "2": "Bài toán thực tế sử dụng diện tích hình phẳng",
          "3": "Thể tích giới hạn bởi các đồ thị (tròn xoay)",
          "4": "Thể tích tính theo mặt cắt S(x)",
          "5": "Bài toán thực tế và ứng dụng thể tích tròn xoay, S(x)"
        }
      },
      "6": {
        "1": {
          "1": "Công thức lý thuyết",
          "2": "Tính xác suất có điều kiện bằng công thức",
          "3": "Tính xác suất có điều kiện bằng sơ đồ cây",
          "4": "Bài toán tổng hợp"
        },
        "2": {
          "1": "Công thức lý thuyết",
          "2": "Tính xác suất bằng công thức xác suất toàn phần",
          "3": "Tính xác suất bằng công thức xác suất Bayes",
          "4": "Bài toán tổng hợp"
        }
      }
    },
    "H": {
      "2": {
        "1": {
          "1": "Công thức lý thuyết",
          "2": "Tổng, hiệu, tích một số với véc-tơ",
          "3": "Tích vô hướng và ứng dụng",
          "4": "Toán thực tế áp dụng các phép toán véc-tơ"
        },
        "2": {
          "1": "Công thức lý thuyết",
          "2": "Tìm tọa độ điểm",
          "3": "Tìm tọa độ véc-tơ",
          "4": "Công thức toạ độ của tích vô hướng và ứng dụng",
          "5": "Công thức toạ độ của tích có hướng và ứng dụng",
          "6": "Toán thực tế áp dụng các phép toán toạ độ hoá véc-tơ"
        }
      },
      "5": {
        "1": {
          "1": "Câu hỏi lý thuyết",
          "2": "Xác định véc-tơ pháp tuyến, cặp véc-tơ chỉ phương",
          "3": "Viết phương trình tổng quát mặt phẳng",
          "4": "Vị trí tương đối giữa hai mặt phẳng (song song, vuông góc)",
          "5": "Khoảng cách điểm tới mặt phẳng",
          "6": "Góc giữa hai mặt phẳng",
          "7": "Toán thực tế áp dụng phương trình mặt phẳng"
        },
        "2": {
          "1": "Câu hỏi lý thuyết",
          "2": "Xác định véc-tơ chỉ phương, cặp véc-tơ pháp tuyến",
          "3": "Viết phương trình tổng quát, chính tắc, tham số đường thẳng",
          "4": "Vị trí tương đối giữa hai đường thẳng",
          "5": "Vị trí tương đối giữa đường thẳng và mặt phẳng",
          "6": "Khoảng cách điểm tới đường thẳng",
          "7": "Góc giữa hai đường thẳng, đường thẳng và mặt phẳng",
          "8": "Toán thực tế áp dụng phương trình đường thẳng"
        },
        "3": {
          "1": "Câu hỏi lý thuyết",
          "2": "Xác định tâm, bán kính, đường kính mặt cầu",
          "3": "Viết phương trình tổng quát mặt cầu",
          "4": "Toán thực tế áp dụng phương trình mặt cầu"
        }
      }
    }
  }
}
