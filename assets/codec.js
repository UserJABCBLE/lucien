/* 글 파일 암호화/복호화: 원본 파일을 열어도 본문이 바로 읽히지 않게 섞어서 저장한다.
   JSON → UTF-8 → 열쇠 문자열로 XOR → base64. (build.py의 encode와 같은 방식) */
window.LogCodec = (() => {
  const KEY = 'bammuksi';
  function decode(text) {
    const raw = atob(String(text).trim());
    const bytes = Uint8Array.from(raw, (c, i) => c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ^ KEY.charCodeAt(i % KEY.length));
    return btoa(bin);
  }
  return {decode, encode};
})();
