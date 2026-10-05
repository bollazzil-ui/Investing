import { Fragment, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Globe,
  GripVertical,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Scale,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { CalcResult, Portfolio, Position, PositionResult } from '../types';
import { formatMoney, formatPercent, formatSignedPercent, uid } from '../lib/format';
import { equalizeWeights, normalizeWeights } from '../lib/calc';
import { seriesColor, isFoldedColor } from '../lib/colors';
import { driftColor, driftTolerance, driftTone } from '../lib/drift';
import { NumberField, Section, TextField, useMediaQuery } from './primitives';
import { Menu, type MenuEntry } from './Menu';
import { AddProductDialog } from './AddProductDialog';
import { ExposureDialog } from './ExposureDialog';
import { PROFILES, profileFor } from '../lib/exposure';

type QuoteStatus = Record<string, 'loading' | 'ok' | { error: string } | undefined>;

export function PositionsTable({
  portfolio,
  result,
  onChange,
  onRemove,
  onRefreshQuote,
  quoteStatus,
}: {
  portfolio: Portfolio;
  result: CalcResult;
  onChange: (positions: Position[]) => void;
  /** Removal goes through the parent so it can offer an undo. */
  onRemove: (id: string) => void;
  onRefreshQuote: (id: string) => void;
  quoteStatus: QuoteStatus;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showExposure, setShowExposure] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const wide = useMediaQuery('(min-width: 768px)');
  const { positions, settings } = portfolio;
  const base = settings.baseCurrency;
  const weightSum = result.targetWeightSum;
  const weightsOk = Math.abs(weightSum - 1) < 1e-6;
  const tolerance = driftTolerance(settings);
  const showAfter = result.positions.some((p) => p.tradeShares !== 0);
  // One shared scale for every weight bar, so bar lengths compare across rows.
  const scale = Math.max(
    0.01,
    ...result.positions.flatMap((p) => [p.actualWeight, p.targetWeight, p.newWeight]),
  );

  function update(id: string, patch: Partial<Position>) {
    onChange(positions.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPosition(position: Position) {
    onChange([...positions, position]);
    setExpanded(position.id);
  }

  function duplicate(p: Position) {
    const copy: Position = { ...p, id: uid(), ticker: `${p.ticker} copy`.trim(), targetWeight: 0 };
    const at = positions.findIndex((x) => x.id === p.id);
    onChange([...positions.slice(0, at + 1), copy, ...positions.slice(at + 1)]);
  }

  function moveTo(id: string, to: number) {
    const at = positions.findIndex((p) => p.id === id);
    if (at < 0) return;
    const next = [...positions];
    const [item] = next.splice(at, 1);
    const target = Math.max(0, Math.min(next.length, to > at ? to - 1 : to));
    if (target === at) return;
    next.splice(target, 0, item);
    onChange(next);
  }

  function label(p: Position, i: number) {
    return p.ticker || `position ${i + 1}`;
  }

  function rowMenu(p: Position, i: number): MenuEntry[] {
    const open = expanded === p.id;
    return [
      {
        label: open ? 'Hide details' : 'Edit details',
        icon: Pencil,
        onSelect: () => setExpanded(open ? null : p.id),
      },
      { label: 'Move up', icon: ArrowUp, onSelect: () => moveTo(p.id, i - 1), disabled: i === 0 },
      {
        label: 'Move down',
        icon: ArrowDown,
        onSelect: () => moveTo(p.id, i + 2),
        disabled: i === positions.length - 1,
      },
      { label: 'Duplicate', icon: Copy, onSelect: () => duplicate(p) },
      { kind: 'separator' },
      { label: 'Remove', icon: Trash2, danger: true, onSelect: () => onRemove(p.id) },
    ];
  }

  function details(p: Position, i: number) {
    return (
      <PositionDetails
        position={p}
        index={i}
        status={quoteStatus[p.id]}
        onUpdate={(patch) => update(p.id, patch)}
        onRefreshQuote={() => onRefreshQuote(p.id)}
      />
    );
  }

  function nameToggle(p: Position) {
    const open = expanded === p.id;
    return (
      <button
        className="btn btn-ghost mt-1 flex w-full max-w-full !justify-start gap-1 overflow-hidden !px-1 !py-0 text-left text-xs"
        onClick={() => setExpanded(open ? null : p.id)}
        aria-expanded={open}
        title={p.name || 'Add name, ISIN, quote symbol'}
      >
        <ChevronRight
          size={13}
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
        <span className="truncate">{p.name || 'Add name, ISIN, quote symbol'}</span>
        {p.locked && <Lock size={12} className="shrink-0 text-[var(--ink-3)]" aria-label="Held" />}
      </button>
    );
  }

  const actions = (
    <>
      <button
        className="btn"
        onClick={() => setShowExposure(true)}
        disabled={positions.length === 0}
        title="Look-through split by continent, country and currency"
      >
        <Globe size={15} aria-hidden /> Exposure
      </button>
      <Menu
        ariaLabel="Target weight tools"
        title="Set the targets in one go"
        trigger={
          <>
            <Scale size={15} aria-hidden /> Targets
          </>
        }
        entries={[
          {
            label: 'Equal weights',
            onSelect: () => onChange(equalizeWeights(positions)),
            disabled: positions.length === 0,
          },
          {
            label: 'Normalise to 100%',
            onSelect: () => onChange(normalizeWeights(positions)),
            disabled: positions.length === 0 || weightsOk,
          },
        ]}
      />
      <button className="btn btn-primary" onClick={() => setAdding(true)}>
        <Plus size={15} aria-hidden /> Add position
      </button>
    </>
  );

  const sumCheck = (
    <span
      className="inline-flex items-center gap-1"
      style={{ color: weightsOk ? undefined : 'var(--critical)' }}
      title={weightsOk ? 'Targets add up to 100%' : 'Targets should add up to 100%'}
    >
      {weightsOk ? (
        <Check size={13} strokeWidth={2.5} style={{ color: 'var(--good)' }} aria-hidden />
      ) : (
        <TriangleAlert size={13} aria-hidden />
      )}
      {formatPercent(weightSum)}
    </span>
  );

  const empty = (
    <div className="px-5 py-12 text-center">
      <p className="text-sm text-[var(--ink-2)]">No positions yet.</p>
      <button className="btn btn-primary mt-3" onClick={() => setAdding(true)}>
        <Plus size={15} aria-hidden /> Add your first position
      </button>
    </div>
  );

  return (
    <Section
      title="Positions"
      description="Your holdings and the split you are aiming for. Value is shares × unit price × exchange rate."
      actions={actions}
    >
      {positions.length === 0 ? (
        empty
      ) : wide ? (
        <div className="scroll-x">
          <table className="w-full min-w-[62rem] border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="th th-left sticky-col w-[15rem]">Instrument</th>
                <th className="th w-[5.5rem]">Currency</th>
                <th className="th w-[8rem]">Unit price</th>
                <th className="th w-[7rem]">Shares</th>
                <th className="th w-[8.5rem]">Value {base}</th>
                <th className="th th-left w-[11rem]">Weight</th>
                <th className="th w-[7rem]">Target</th>
                <th className="th w-[6rem]">Drift</th>
                <th className="th w-[7rem]">Fee</th>
                <th className="th w-[3rem]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const r = result.positions.find((x) => x.id === p.id);
                const open = expanded === p.id;
                const tone = r ? driftTone(r.driftWeight, tolerance) : 'ok';
                return (
                  <Fragment key={p.id}>
                    <tr
                      className="border-b border-[var(--border)] align-middle transition-colors hover:bg-[var(--surface-2)]/70"
                      style={{
                        opacity: dragId === p.id ? 0.45 : undefined,
                        boxShadow:
                          dropAt === i
                            ? 'inset 0 2px 0 var(--accent)'
                            : dropAt === i + 1 && i === positions.length - 1
                              ? 'inset 0 -2px 0 var(--accent)'
                              : undefined,
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDropAt(e.clientY < rect.top + rect.height / 2 ? i : i + 1);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragId && dropAt !== null) moveTo(dragId, dropAt);
                        setDragId(null);
                        setDropAt(null);
                      }}
                    >
                      <td className="td td-left sticky-col !pl-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            draggable
                            onDragStart={(e) => {
                              setDragId(p.id);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', p.id);
                              const row = e.currentTarget.closest('tr');
                              if (row) e.dataTransfer.setDragImage(row, 16, 20);
                            }}
                            onDragEnd={() => {
                              setDragId(null);
                              setDropAt(null);
                            }}
                            className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center rounded text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)] active:cursor-grabbing"
                            title="Drag to reorder"
                            aria-hidden
                          >
                            <GripVertical size={14} />
                          </span>
                          <span
                            className="h-7 w-1 shrink-0 rounded-full"
                            style={{ background: seriesColor(i) }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <TextField
                              value={p.ticker}
                              onChange={(v) => update(p.id, { ticker: v })}
                              placeholder="Ticker"
                              ariaLabel={`Ticker for position ${i + 1}`}
                              className="font-semibold"
                            />
                            {nameToggle(p)}
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <TextField
                          value={p.currency}
                          onChange={(v) => update(p.id, { currency: v.toUpperCase().slice(0, 5) })}
                          ariaLabel={`Currency for ${label(p, i)}`}
                          className="text-center uppercase"
                        />
                      </td>
                      <td className="td">
                        <NumberField
                          value={p.unitPrice}
                          onChange={(v) => update(p.id, { unitPrice: v })}
                          min={0}
                          ariaLabel={`Unit price for ${label(p, i)}`}
                        />
                        {r && p.currency !== base && (
                          <div className="num mt-0.5 text-[0.6875rem] text-[var(--ink-3)]">
                            = {formatMoney(r.priceBase, base, 4)}
                          </div>
                        )}
                      </td>
                      <td className="td">
                        <NumberField
                          value={p.shares}
                          onChange={(v) => update(p.id, { shares: v })}
                          ariaLabel={`Shares held of ${label(p, i)}`}
                        />
                      </td>
                      <td className="td num font-medium">{r ? formatMoney(r.valueBase) : '—'}</td>
                      <td className="td td-left">
                        {r ? (
                          <WeightBar r={r} index={i} scale={scale} showAfter={showAfter} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="td">
                        <NumberField
                          value={p.targetWeight * 100}
                          onChange={(v) => update(p.id, { targetWeight: v / 100 })}
                          suffix="%"
                          min={0}
                          max={100}
                          ariaLabel={`Target weight for ${label(p, i)}`}
                        />
                      </td>
                      <td className="td num font-medium">
                        {r ? <Drift value={r.driftWeight} tone={tone} /> : '—'}
                      </td>
                      <td className="td">
                        <NumberField
                          value={p.fee}
                          onChange={(v) => update(p.id, { fee: v })}
                          min={0}
                          suffix={p.currency}
                          ariaLabel={`Fee for ${label(p, i)}`}
                        />
                      </td>
                      <td className="td !pr-2">
                        <Menu
                          ariaLabel={`Actions for ${label(p, i)}`}
                          triggerClassName="btn btn-ghost !h-8 !w-8 !p-0"
                          trigger={<MoreHorizontal size={17} aria-hidden />}
                          entries={rowMenu(p, i)}
                        />
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                        <td colSpan={10} className="px-4 py-3">
                          {details(p, i)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--surface-2)]">
                <td className="td td-left sticky-col font-semibold">Total</td>
                <td className="td" colSpan={3} />
                <td className="td num font-semibold">{formatMoney(result.currentTotal)}</td>
                <td className="td" />
                <td className="td num font-semibold">{sumCheck}</td>
                <td className="td" />
                <td className="td num font-semibold" title={`All fees, converted into ${base}`}>
                  {formatMoney(result.feesReserved)} {base}
                </td>
                <td className="td" />
              </tr>
            </tfoot>
          </table>
          <div className="px-4 py-2 sm:px-5">
            <WeightLegend showAfter={showAfter} />
          </div>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border)]">
            {positions.map((p, i) => {
              const r = result.positions.find((x) => x.id === p.id);
              const tone = r ? driftTone(r.driftWeight, tolerance) : 'ok';
              return (
                <li key={p.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 h-7 w-1 shrink-0 rounded-full"
                      style={{ background: seriesColor(i) }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <TextField
                        value={p.ticker}
                        onChange={(v) => update(p.id, { ticker: v })}
                        placeholder="Ticker"
                        ariaLabel={`Ticker for position ${i + 1}`}
                        className="font-semibold"
                      />
                      {nameToggle(p)}
                    </div>
                    <div className="w-20 shrink-0">
                      <TextField
                        value={p.currency}
                        onChange={(v) => update(p.id, { currency: v.toUpperCase().slice(0, 5) })}
                        ariaLabel={`Currency for ${label(p, i)}`}
                        className="text-center uppercase"
                      />
                    </div>
                    <Menu
                      ariaLabel={`Actions for ${label(p, i)}`}
                      triggerClassName="btn btn-ghost !h-9 !w-9 shrink-0 !p-0"
                      trigger={<MoreHorizontal size={17} aria-hidden />}
                      entries={rowMenu(p, i)}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <MobileField label={`Unit price (${p.currency})`}>
                      <NumberField
                        value={p.unitPrice}
                        onChange={(v) => update(p.id, { unitPrice: v })}
                        min={0}
                        ariaLabel={`Unit price for ${label(p, i)}`}
                      />
                    </MobileField>
                    <MobileField label="Shares">
                      <NumberField
                        value={p.shares}
                        onChange={(v) => update(p.id, { shares: v })}
                        ariaLabel={`Shares held of ${label(p, i)}`}
                      />
                    </MobileField>
                    <MobileField label="Target">
                      <NumberField
                        value={p.targetWeight * 100}
                        onChange={(v) => update(p.id, { targetWeight: v / 100 })}
                        suffix="%"
                        min={0}
                        max={100}
                        ariaLabel={`Target weight for ${label(p, i)}`}
                      />
                    </MobileField>
                    <MobileField label="Fee">
                      <NumberField
                        value={p.fee}
                        onChange={(v) => update(p.id, { fee: v })}
                        min={0}
                        suffix={p.currency}
                        ariaLabel={`Fee for ${label(p, i)}`}
                      />
                    </MobileField>
                  </div>

                  {r && (
                    <div className="mt-3 flex items-end gap-3">
                      <div className="min-w-0 flex-1">
                        <WeightBar r={r} index={i} scale={scale} showAfter={showAfter} />
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="num text-sm font-semibold">
                          {formatMoney(r.valueBase, base)}
                        </div>
                        <div className="num text-xs font-medium">
                          <Drift value={r.driftWeight} tone={tone} />
                        </div>
                      </div>
                    </div>
                  )}

                  {expanded === p.id && (
                    <div className="mt-3 rounded-[var(--r-md)] bg-[var(--surface-2)] p-3">
                      {details(p, i)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold">
            <span>
              Total <span className="num">{formatMoney(result.currentTotal, base)}</span>
            </span>
            <span className="num text-xs">Targets {sumCheck}</span>
          </div>
          <div className="px-4 py-2">
            <WeightLegend showAfter={showAfter} />
          </div>
        </>
      )}

      <AddProductDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={addPosition}
        baseCurrency={base}
        defaultFee={positions.length > 0 ? positions[positions.length - 1].fee : 0}
        suggestedWeight={Math.max(0, 1 - weightSum)}
      />
      <ExposureDialog
        open={showExposure}
        onClose={() => setShowExposure(false)}
        positions={positions}
        result={result}
        baseCurrency={base}
      />
    </Section>
  );
}

function MobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[0.6875rem] font-medium text-[var(--ink-3)]">{label}</span>
      {children}
    </label>
  );
}

function Drift({ value, tone }: { value: number; tone: ReturnType<typeof driftTone> }) {
  return (
    <span
      className="inline-flex items-center justify-end gap-0.5"
      style={{ color: driftColor(tone) }}
      title={
        tone === 'ok'
          ? 'Within the drift tolerance (see Settings)'
          : tone === 'over'
            ? 'Overweight — above target'
            : 'Underweight — below target'
      }
    >
      {tone === 'over' && <ArrowUp size={12} strokeWidth={2.5} aria-hidden />}
      {tone === 'under' && <ArrowDown size={12} strokeWidth={2.5} aria-hidden />}
      {formatSignedPercent(value)}
    </span>
  );
}

/**
 * Where a position sits against its target, in one line: a faint bar for the
 * weight today, a solid thin bar for the weight once the plan is executed,
 * and a tick at the target.
 */
function WeightBar({
  r,
  index,
  scale,
  showAfter,
}: {
  r: PositionResult;
  index: number;
  scale: number;
  showAfter: boolean;
}) {
  const pct = (w: number) => `${Math.max(0, Math.min(1, w / scale)) * 100}%`;
  const color = seriesColor(index);
  return (
    <div
      className="min-w-0"
      title={`Now ${formatPercent(r.actualWeight)} · target ${formatPercent(r.targetWeight)}${
        showAfter ? ` · after the plan ${formatPercent(r.newWeight)}` : ''
      }`}
    >
      <div className="num flex items-baseline gap-1.5 text-sm">
        <span className="font-medium text-[var(--ink-1)]">{formatPercent(r.actualWeight)}</span>
        {showAfter && Math.abs(r.newWeight - r.actualWeight) > 5e-5 && (
          <span className="text-xs text-[var(--ink-3)]">→ {formatPercent(r.newWeight)}</span>
        )}
      </div>
      <div className="relative mt-1 h-2.5 w-full rounded-full bg-[var(--surface-2)]" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: pct(r.actualWeight), background: color, opacity: 0.35 }}
        />
        {showAfter && (
          <span
            className="absolute left-0 top-[3px] h-1 rounded-full"
            style={{ width: pct(r.newWeight), background: color }}
          />
        )}
        <span
          className="absolute -top-0.5 h-3.5 w-0.5 -translate-x-1/2 rounded-full"
          style={{ left: pct(r.targetWeight), background: 'var(--ink-1)' }}
        />
      </div>
    </div>
  );
}

function WeightLegend({ showAfter }: { showAfter: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.6875rem] font-normal text-[var(--ink-3)]">
      <span className="flex items-center gap-1">
        <span className="h-2 w-3 rounded-sm bg-[var(--ink-3)] opacity-40" aria-hidden /> now
      </span>
      {showAfter && (
        <span className="flex items-center gap-1">
          <span className="h-1 w-3 rounded-sm bg-[var(--ink-3)]" aria-hidden /> after plan
        </span>
      )}
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-0.5 rounded-full bg-[var(--ink-1)]" aria-hidden /> target
      </span>
    </span>
  );
}

function PositionDetails({
  position: p,
  index,
  status,
  onUpdate,
  onRefreshQuote,
}: {
  position: Position;
  index: number;
  status: QuoteStatus[string];
  onUpdate: (patch: Partial<Position>) => void;
  onRefreshQuote: () => void;
}) {
  const detected = profileFor({ ...p, exposureProfile: undefined });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor={`name-${p.id}`}>
            Full name
          </label>
          <input
            id={`name-${p.id}`}
            className="field"
            value={p.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="iShares Core MSCI World"
          />
        </div>
        <div>
          <label className="label" htmlFor={`isin-${p.id}`}>
            ISIN
          </label>
          <input
            id={`isin-${p.id}`}
            className="field"
            value={p.isin ?? ''}
            onChange={(e) => onUpdate({ isin: e.target.value })}
            placeholder="IE00B4L5Y983"
          />
        </div>
        <div>
          <label className="label" htmlFor={`quote-${p.id}`}>
            Quote symbol (Yahoo Finance)
          </label>
          <div className="flex gap-2">
            <input
              id={`quote-${p.id}`}
              className="field"
              value={p.quoteSymbol ?? ''}
              onChange={(e) => onUpdate({ quoteSymbol: e.target.value })}
              placeholder="SWDA.L"
            />
            <button
              className="btn"
              onClick={onRefreshQuote}
              disabled={!p.quoteSymbol || status === 'loading'}
            >
              {status === 'loading' ? '…' : 'Fetch'}
            </button>
          </div>
          {status && status !== 'loading' && (
            <p
              className="mt-1 text-[0.6875rem]"
              style={{ color: status === 'ok' ? 'var(--good)' : 'var(--critical)' }}
            >
              {status === 'ok' ? 'Price updated' : status.error}
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor={`exposure-${p.id}`}>
            Exposure (tracked index)
          </label>
          <select
            id={`exposure-${p.id}`}
            className="field"
            value={p.exposureProfile ?? ''}
            onChange={(e) => onUpdate({ exposureProfile: e.target.value || undefined })}
          >
            <option value="">
              {detected ? `Auto: ${detected.label}` : 'Auto: not recognised'}
            </option>
            {PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(p.locked)}
              onChange={(e) => onUpdate({ locked: e.target.checked })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">Hold — never trade</span>
              <span className="block text-xs text-[var(--ink-3)]">
                Counts toward the total, but no buy or sell is planned.
              </span>
            </span>
          </label>
        </div>
      </div>
      {isFoldedColor(index) && (
        <p className="mt-2 text-[0.6875rem] text-[var(--ink-3)]">
          Beyond eight positions the colours fold into one neutral shade — the numbers stay exact.
        </p>
      )}
    </>
  );
}
