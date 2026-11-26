export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F6F4F0", paper2: "#EFEBE4", hair: "#E2DCD2",
        lilac: { 50: "#F5F1FE", 100: "#ECE5FD", 200: "#DACFFB", 300: "#BFAEF6" },
        violet: { DEFAULT: "#6A4BE0", ink: "#4B33B5" },
        ink: "#17132B", midnight: { DEFAULT: "#0E0A24", 800: "#161036", 700: "#1F1850" }, gold: { DEFAULT: "#C9A45C", ink: "#7A5A1E", 100: "#F6EBD3" }, muted: "#5C566F", owed: { DEFAULT: "#0E7A57", ink: "#0B6648" }, ember: { DEFAULT: "#C2410C", ink: "#9A3412" },
      },
      fontFamily: { display: ["Gambetta", "Georgia", "serif"], sans: ["Switzer", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "ui-monospace", "monospace"] },
      borderRadius: { cap: "14px" },
    },
  },
};
