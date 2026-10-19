"use client";

import { useState } from "react";
import { Check, Settings2 } from "lucide-react";
import {
  CAFFEINE_LABEL,
  CHRONOTYPE_LABEL,
  DEFAULT_BEDTIME_MIN,
  type CaffeineSensitivity,
  type Chronotype,
  type Profile,
} from "@/lib/profile";

function Choice<T extends string>({
  label,
  hint,
  value,
  options,
  onPick,
}: {
  label: string;
  hint: string;
  value: T;
  options: Record<T, string>;
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-[17px] font-semibold">{label}</p>
      <p className="mt-0.5 text-[15px] text-fg-2">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-2.5" role="group" aria-label={label}>
        {(Object.keys(options) as T[]).map((k) => (
          <button key={k} type="button" aria-pressed={value === k} onClick={() => onPick(k)} className="chip">
            {options[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 첫 방문 때 한 번만 묻는 두 가지 — 크로노타입(플랜의 취침 시각 기본값)과 카페인 민감도(반감기 가정).
 * 저장 뒤에는 한 줄 요약만 남기고, 누르면 다시 고칠 수 있다.
 */
export default function ProfileCard({
  profile,
  onSave,
}: {
  profile: Profile | null;
  onSave: (p: Profile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [chrono, setChrono] = useState<Chronotype>(profile?.chronotype ?? "neutral");
  const [caf, setCaf] = useState<CaffeineSensitivity>(profile?.caffeine ?? "normal");

  const save = () => {
    // 크로노타입이 바뀌었으면 취침 시각 기본값도 따라가고, 같으면 기존에 고른 시각을 유지한다.
    const bedtimeMin =
      profile && profile.chronotype === chrono ? profile.bedtimeMin : DEFAULT_BEDTIME_MIN[chrono];
    onSave({ chronotype: chrono, caffeine: caf, bedtimeMin });
    setEditing(false);
  };

  if (profile && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mx-auto mb-8 flex items-center gap-2 rounded-full bg-fg/[0.06] px-4 py-2 text-[15px] font-medium text-fg-2 transition hover:bg-fg/[0.1]"
      >
        <Settings2 className="h-4 w-4" strokeWidth={2} />
        내 설정 · {CHRONOTYPE_LABEL[profile.chronotype]} · 카페인 {CAFFEINE_LABEL[profile.caffeine]}
      </button>
    );
  }

  if (!profile && dismissed) return null;

  return (
    <div className="card mx-auto mb-8 max-w-3xl">
      <p className="t-card-title">나에게 맞추기</p>
      <p className="mt-2 text-[17px] text-fg-2">딱 한 번만 알려주세요. 이 기기에만 저장돼요.</p>

      <div className="mt-7 space-y-7">
        <Choice
          label="나는 어떤 편인가요?"
          hint="오늘 밤 플랜의 취침 시각 기본값에 써요."
          value={chrono}
          options={CHRONOTYPE_LABEL}
          onPick={setChrono}
        />
        <Choice
          label="카페인에 얼마나 민감한가요?"
          hint="몸에서 카페인이 빠지는 속도를 다르게 계산해요."
          value={caf}
          options={CAFFEINE_LABEL}
          onPick={setCaf}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-5">
        <button type="button" onClick={save} className="btn btn-primary">
          <Check className="mr-2 h-5 w-5" strokeWidth={2.4} />
          저장
        </button>
        <button
          type="button"
          onClick={() => (profile ? setEditing(false) : setDismissed(true))}
          className="link"
        >
          {profile ? "취소" : "나중에 할게요"}
        </button>
      </div>
    </div>
  );
}
