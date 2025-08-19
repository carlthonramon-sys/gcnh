import qrcode from "qrcode-terminal";

const payloadPIX = "00020126490014br.gov.bcb.pix0127financas@somossimpay.com.br52040000530398654045.005802BR5919SSIMPAYGATEWAY376706009Sao Paulo62250521mpqrinter1228115869726304C375";

// Mostra versão pequena no terminal
qrcode.generate(payloadPIX, { small: true });
