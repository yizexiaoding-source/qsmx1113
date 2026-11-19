import React, { useId } from 'react';

export default function TargetLength({ value, onChange }: { value: number; onChange: (value: number) => void }) {
 const id = useId();
 return <div className="space-y-3">
  <div className="flex items-center justify-between gap-3 text-xs font-bold text-sky-500">
   <label htmlFor={id}>目标字数</label>
   <span>{value ? `${value.toLocaleString()} 字` : '按任务要求'}</span>
  </div>
  <input id={id} aria-label="目标字数" type="range" min="0" max={Math.max(30000, value)} step="500" value={value} onChange={e => onChange(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none bg-sky-100 accent-sky-500 cursor-pointer" />
  <p className="text-xs text-gray-500">{value ? `合格范围：${Math.ceil(value * .95)}～${Math.floor(value * 1.05)} 字` : '拖动设置目标字数；未设置时按创作要求生成。'}</p>
 </div>;
}
