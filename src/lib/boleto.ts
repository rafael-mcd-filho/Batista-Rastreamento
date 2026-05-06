export function boletoParameterFromLink(link: string | null | undefined) {
  const value = link?.trim();

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    const boletoIndex = segments.findIndex((segment) =>
      /^boletos?$/i.test(segment)
    );
    const pathValue =
      boletoIndex >= 0
        ? segments.slice(boletoIndex + 1).join("/")
        : segments[segments.length - 1];

    return pathValue ? `${pathValue}${url.search}` : null;
  } catch {
    const match = value.match(/\/boletos?\/(.+)$/i);
    return match?.[1] ?? value;
  }
}
