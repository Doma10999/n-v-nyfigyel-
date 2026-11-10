export default async () => {
  const key = Netlify.env.get("NF_VAPID_PUBLIC_KEY");
  if (Netlify.env.get("NF_ALERTS_ENABLED") !== "true" || !key || !Netlify.env.get("NF_VAPID_PRIVATE_KEY")) {
    return new Response(null, { status: 503 });
  }
  return Response.json({ key }, { headers: { "Cache-Control": "no-store" } });
};
