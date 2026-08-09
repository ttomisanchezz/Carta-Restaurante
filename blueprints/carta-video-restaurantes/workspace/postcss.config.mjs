/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind v4 se conecta con @tailwindcss/postcss.
    // NUNCA con la entrada `tailwindcss` del plugin viejo: eso es v3 y no existe aca.
    "@tailwindcss/postcss": {},
  },
};

export default config;
