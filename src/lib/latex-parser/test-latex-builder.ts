import { parseWordQuestion } from './word-parser'
import { buildExamWithSolutionLatex } from '../word-latex-builder'

const latexBlock = `
\\begin{ex}%[2D1H3-6]
Một nhà sản xuất trung bình bán được $1500$ ti vi màn hình phẳng mỗi tuần với giá $15$ triệu đồng một chiếc. Một cuộc khảo sát thị trường chỉ ra rằng nếu cứ giảm giá bán $600$ nghìn đồng, số lượng ti vi bán ra sẽ tăng thêm khoảng $120$ ti vi mỗi tuần. Gọi $p$ (triệu đồng) là giá của mỗi ti vi, $x$ là số ti vi.
\\choiceTF
{\\True Hàm cầu là $p=-\\dfrac{1}{200}x+\\dfrac{45}{2}$ (triệu đồng)}
{Tổng doanh thu từ tiền bán ti vi là $f(p)=-200p^2+450p$ (triệu đồng)}
{Công ty giảm giá $3{,}5$ triệu đồng cho người mua thì doanh thu của công ty sẽ lớn nhất}
{\\True Nếu hàm chi phí hằng tuần là $C(x)=12000-\\dfrac{7}{2}x$ (triệu đồng), trong đó $x$ là số ti vi bán ra trong tuần, nhà sản xuất nên đặt giá bán $9{,}5$ triệu đồng thì lợi nhuận là lớn nhất}

\\loigiai{
    \\begin{itemchoice}
        \\itemch Đúng. Hàm cầu có dạng $x=ap+b$.
        Thay $p=15$, $x=1500$ ta có $1500=15a+b$.
        Thay $p=15-0{,}6$, $x=1500+120$ ta có $1620=14{,}4a+b$.
        Suy ra $a=-200$, $b=4500$.
        Vậy $x=-200p+4500 \\Leftrightarrow p=-\\dfrac{1}{200}x+\\dfrac{45}{2}$.
        
        \\itemch Sai. 
        \\begin{itemize}
            \\item $p=-\\dfrac{1}{200}x+\\dfrac{45}{2} \\Rightarrow x = -200p +4500$.
            \\item Hàm doanh thu từ số tivi bán được là $f(p)= px= p\\left(-200p +4500 \\right) = -200p^2 +4500p$.
        \\end{itemize}	
        
        \\itemch Sai. Hàm doanh thu từ số tivi bán được là $R(x)= px = x \\left( -\\dfrac{1}{200}x+\\dfrac{45}{2} \\right) = -\\dfrac{1}{200}x^2+\\dfrac{45}{2}x$.\\\\
        Đây là hàm số bậc hai có bảng biến thiên như sau
        \\begin{center}
            \\begin{tikzpicture}
                \\tkzTabInit[nocadre=false,lgt=1.2,espcl=2.5,deltacl=0.6]
                {$x$ /0.6,$R'(x)$ /0.6,$R(x)$ /2}
                {$0$,$2250$,$+\\infty$}
                \\tkzTabLine{,+,$0$,-,}
                \\tkzTabVar{-/, +/,-/ }
            \\end{tikzpicture}
        \\end{center}
        Doanh thu của công ty sẽ lớn nhất khi bán 2250 ti vi mỗi tuần. Khi đó giá bán $p(2250) = 11{,}25$ triệu đồng. Tương ứng với mức giảm giá $15-11{,}25= 3{,}75$ triệu đồng.
        
        \\itemch  Đúng. Hàm lợi nhuận thu được là $L(x)= R(x)- C(x) = -\\dfrac{1}{200}x^2+\\dfrac{45}{2}x - \\left(12000-\\dfrac{7}{2}x \\right) = -\\dfrac{1}{200}x^2 +26x-12000$.\\\\
        $L'(x) = - \\dfrac{1}{100}x +26$; $L'(x)=0 \\Leftrightarrow x = 2600$.
        \\begin{center}
            \\begin{tikzpicture}
                \\tkzTabInit[nocadre=false,lgt=1.2,espcl=2.5,deltacl=0.6]
                {$x$ /0.6,$L'(x)$ /0.6,$L(x)$ /2}
                {$0$,$2600$,$+\\infty$}
                \\tkzTabLine{,+,$0$,-,}
                \\tkzTabVar{-/, +/$21800$,-/ }
            \\end{tikzpicture}
        \\end{center}
        Lợi nhuận của công ty cao nhất khi bán được $2600$ ti vi mỗi tuần. Khi đó giá bán là $P(2600)= 9{,}5$ triệu đồng.
    \\end{itemchoice}	
}
\\end{ex}
`
const parsed = parseWordQuestion(latexBlock)
const tex = buildExamWithSolutionLatex({
  header: { labels: [], examCode: '123', duration: 90, grade: 12 },
  questions: [parsed],
  imagePaths: new Map()
})
console.log(tex)
