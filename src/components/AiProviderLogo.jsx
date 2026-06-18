import React, { useState } from 'react';
import { getProviderMeta } from '../domain/aiModelCatalog';

export default function AiProviderLogo({ model, className = 'h-7 w-7', showLab = false }) {
  const [failed, setFailed] = useState(false);
  const url = showLab ? model?.labLogoUrl : model?.logoUrl;
  const provider = getProviderMeta(model?.id || '', model?.provider);

  if (url && !failed) {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white p-1 ${className}`}>
        <img
          src={url}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${provider.color} ${className}`}>
      {provider.icon}
    </span>
  );
}
