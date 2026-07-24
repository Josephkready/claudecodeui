import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OnboardingStepProgress from './OnboardingStepProgress';

/*
 * #247: a completed step kept rendering its red "Required" label next to the
 * green checkmark, so the last screen before "Complete Setup" showed a step
 * that was simultaneously done and flagged as an outstanding requirement.
 */

describe('OnboardingStepProgress — required label (#247)', () => {
  it('flags the required step while it is still the active step', () => {
    render(<OnboardingStepProgress currentStep={0} />);

    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('drops the "Required" label once the step is completed', () => {
    render(<OnboardingStepProgress currentStep={1} />);

    expect(screen.queryByText('Required')).toBeNull();
  });
});
