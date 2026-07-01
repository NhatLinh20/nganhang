import { expandMacros } from './src/lib/latex-parser/latex-math-expander';

const text = "f'(x)=0\\Leftrightarrow \\hoac{                 &x=3\\\\                 &x=-2.\\\\  }";
console.log("Original:", text);
console.log("Expanded:", expandMacros(text));
