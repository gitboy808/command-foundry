globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes("releases.openai.com")) {
    return new Response(JSON.stringify({ tag_name: "0.149.1" }));
  }
  if (url.includes("pi.dev")) {
    return new Response(JSON.stringify({ version: "0.84.2" }));
  }
  return new Response("0.0.0");
};
