import type { ComponentProps } from "react";
import { IncomeForm } from "../create/income-form";
import { CreditAllocationSelector } from "../create/credit-allocation-selector";

type IncomeFormProps = ComponentProps<typeof IncomeForm>;
type CreditAllocationSelectorProps = ComponentProps<typeof CreditAllocationSelector>;

type Props = {
  formProps: IncomeFormProps;
  showCreditAllocation: boolean;
  creditAllocationProps: CreditAllocationSelectorProps;
};

export function IncomeSection({ formProps, showCreditAllocation, creditAllocationProps }: Props) {
  return (
    <IncomeForm
      {...formProps}
      creditAllocationSection={showCreditAllocation ? <CreditAllocationSelector {...creditAllocationProps} /> : null}
    />
  );
}
