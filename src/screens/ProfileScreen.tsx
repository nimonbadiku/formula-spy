import { useAppStore } from "@/store/appStore";
import { GlassPanel } from "@/components/GlassPanel";
import { Button } from "@/components/Button";
import { colors } from "@/theme/tokens";
import "./ProfileScreen.css";

const LABEL_MAP: Record<string, Record<string, string>> = {
  curlPattern: { wavy: "Wavy", curly: "Curly", coily: "Coily" },
  porosity: { low: "Low", normal: "Normal", high: "High" },
  density: { low: "Low", med: "Medium", high: "High" },
  oiliness: { dry: "Dry", normal: "Normal", oily: "Oily" },
  condition: { damaged: "Damaged", normal: "Normal", healthy: "Healthy" },
};

function formatLabel(section: string, value: string): string {
  return LABEL_MAP[section]?.[value] ?? value;
}

/** Compact badge: small pill showing Yes/No with subtle coloring */
function CompactBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`compact-badge ${active ? "compact-badge--active" : ""}`}>
      {label}
    </span>
  );
}

interface ProfileScreenProps {
  readonly onEditProfile?: () => void;
}

export function ProfileScreen({ onEditProfile }: ProfileScreenProps) {
  const profile = useAppStore((s) => s.profile);

  if (!profile) {
    return (
      <div className="stack-24">
        <div>
          <div className="eyebrow">Formula Spy</div>
          <h1 className="screen-title" style={{ marginTop: 4 }}>
            Profile
          </h1>
        </div>
        <GlassPanel style={{ textAlign: "center", padding: 32 }}>
          <div className="profile-empty" aria-hidden>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 20v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="profile-section-title" style={{ textAlign: "center", marginTop: 12 }}>
            No profile yet
          </h2>
          <p className="subtitle" style={{ textAlign: "center", marginTop: 4 }}>
            Complete the hair quiz to build your profile and get personalized
            product scores.
          </p>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="profile-page">
      {/* Header */}
      <div>
        <div className="eyebrow">Formula Spy</div>
        <h1 className="screen-title" style={{ marginTop: 4 }}>
          Profile
        </h1>
      </div>

      {/* Hero summary card */}
      <GlassPanel className="profile-hero">
        <div className="profile-avatar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke={colors.blue} strokeWidth="1.8" />
            <path d="M5 20v-1a7 7 0 0 1 14 0v1" stroke={colors.blue} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className="profile-hero__text">
          <span className="profile-hero__title">Your Hair Profile</span>
          <span className="profile-hero__meta">Last updated {new Date(profile.updatedAt).toLocaleDateString()}</span>
        </div>
      </GlassPanel>

      {/* Compact profile details */}
      <GlassPanel className="profile-details" padding={16}>
        {/* Hair type row */}
        <div className="profile-row">
          <span className="profile-row__label">Hair Type</span>
          <span className="profile-row__value">
            {formatLabel("curlPattern", profile.curlPattern)} · {formatLabel("porosity", profile.porosity)} porosity
          </span>
        </div>

        {/* Density */}
        <div className="profile-row">
          <span className="profile-row__label">Density</span>
          <span className="profile-row__value">{formatLabel("density", profile.density)}</span>
        </div>

        {/* Oiliness / scalp */}
        <div className="profile-row">
          <span className="profile-row__label">Scalp</span>
          <span className="profile-row__value">{formatLabel("oiliness", profile.oiliness)}</span>
        </div>

        {/* Condition */}
        <div className="profile-row">
          <span className="profile-row__label">Condition</span>
          <span className="profile-row__value">{formatLabel("condition", profile.condition)}</span>
        </div>

        {/* Sensitivity row */}
        <div className="profile-row profile-row--multi">
          <span className="profile-row__label">Sensitivities</span>
          <div className="profile-row__badges">
            <CompactBadge active={profile.proteinSensitivity} label="Protein" />
            <CompactBadge active={profile.siliconeSensitivity} label="Silicone" />
            <CompactBadge active={profile.chemicallyTreated} label="Chemically treated" />
          </div>
        </div>
      </GlassPanel>

      {/* Edit profile button — same style as Analyze formula button */}
      {onEditProfile && (
        <Button fullWidth variant="primary" onClick={onEditProfile}>
          Edit hair profile
        </Button>
      )}
    </div>
  );
}