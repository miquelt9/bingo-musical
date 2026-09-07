import QRCode from "qrcode";

export async function generateQrDataUrl(
  text: string,
  size = 128
): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: {
      dark: "#18181b",
      light: "#ffffff",
    },
  });
}
