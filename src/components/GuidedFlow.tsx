import { useState } from 'react';
import type { CalcResult, Portfolio, Position, Settings } from '../types';
import { Stepper } from './guided/Stepper';
import { StepMoney } from './guided/StepMoney';
import { StepProducts } from './guided/StepProducts';
import { StepDistribution } from './guided/StepDistribution';
import { StepResult } from './guided/StepResult';

export function GuidedFlow({
  portfolio,
  result,
  onPositions,
  onSettings,
  onExportCsv,
  onAdvanced,
}: {
  portfolio: Portfolio;
  result: CalcResult;
  onPositions: (next: Position[]) => void;
  onSettings: (next: Settings) => void;
  onExportCsv: () => void;
  onAdvanced: () => void;
}) {
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);

  function go(next: number) {
    setStep(next);
    setFurthest((f) => Math.max(f, next));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-4">
      <div className="card px-2 py-2 sm:px-3">
        <Stepper current={step} furthest={furthest} onGo={go} />
      </div>

      {step === 0 && (
        <StepMoney
          settings={portfolio.settings}
          result={result}
          onChange={onSettings}
          onNext={() => go(1)}
        />
      )}
      {step === 1 && (
        <StepProducts
          positions={portfolio.positions}
          settings={portfolio.settings}
          result={result}
          onChange={onPositions}
          onBack={() => go(0)}
          onNext={() => go(2)}
        />
      )}
      {step === 2 && (
        <StepDistribution
          positions={portfolio.positions}
          settings={portfolio.settings}
          result={result}
          onChange={onPositions}
          onBack={() => go(1)}
          onNext={() => go(3)}
        />
      )}
      {step === 3 && (
        <StepResult
          result={result}
          settings={portfolio.settings}
          onSettings={onSettings}
          onBack={() => go(2)}
          onExportCsv={onExportCsv}
          onAdvanced={onAdvanced}
        />
      )}
    </div>
  );
}
