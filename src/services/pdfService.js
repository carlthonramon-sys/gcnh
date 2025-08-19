// src/services/pdfService.js
import PDFDocument from "pdfkit";
import { format } from "date-fns";

export function buildDarfPDFStream({ nome, cpf, amount, ref, pix }) {
  // amount em centavos -> reais
  const valor = typeof amount === "number" ? (amount / 100).toFixed(2) : "0,00";
  const hoje = format(new Date(), "dd/MM/yyyy");

  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // Cabeçalho
  doc
    .fontSize(18)
    .text("DARF (simulado)", { align: "center" })
    .moveDown(1);

  // Dados do contribuinte
  doc.fontSize(12).text(`Nome: ${nome || "-"}`);
  doc.text(`CPF: ${cpf || "-"}`);
  doc.text(`Referência: ${ref || "-"}`);
  doc.text(`Data de emissão: ${hoje}`);
  doc.moveDown(1);

  // Valor
  doc.fontSize(14).text(`Valor: R$ ${valor}`, { underline: true });
  doc.moveDown(1);

  // PIX (se tiver)
  if (pix?.qrcode) {
    doc.fontSize(12).text("Copia e Cola PIX:", { underline: true });
    doc.font("Courier").fontSize(10).text(pix.qrcode, {
      width: 500,
      align: "left",
    });
    doc.font("Helvetica");
  }

  // Rodapé
  doc.moveDown(2);
  doc.fontSize(10).text("Documento gerado eletronicamente.", { align: "center" });

  // Retorne o stream para o Express fazer pipe
  return doc;
}
