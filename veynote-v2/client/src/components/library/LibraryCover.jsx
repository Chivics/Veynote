import AuthImage from "../AuthImage.jsx";

const FALLBACKS = {
  reading: ["#20182e", "#0d1729"], films: ["#291629", "#10192b"],
  travel: ["#123134", "#12213b"], bucket: ["#392a13", "#221429"],
  goals: ["#152f2b", "#17203a"], ideas: ["#362814", "#241628"], projects: ["#172841", "#171a25"],
};

export default function LibraryCover({ item, config, configKey, className = "", compact = false }) {
  if (item?.coverUrl) {
    return <AuthImage src={item.coverUrl} alt={`${item.title || config.label} cover`} className={`library-cover-image ${className}`} style={{ minHeight: compact ? 0 : 220 }} />;
  }
  const [from, to] = FALLBACKS[configKey] || FALLBACKS.projects;
  return (
    <div className={`library-cover-fallback ${className}`} style={{ background: `radial-gradient(circle at 70% 18%, rgba(214,170,82,.2), transparent 34%), linear-gradient(145deg, ${from}, ${to})` }}>
      <span>{config.icon}</span>
      <small>{item?.category || config.label}</small>
    </div>
  );
}
