import type { ComponentProps } from "react";
import { TransferForm } from "../create/transfer-form";
import { CreditAllocationSelector } from "../create/credit-allocation-selector";

type TransferFormProps = ComponentProps<typeof TransferForm>;
type CreditAllocationSelectorProps = ComponentProps<typeof CreditAllocationSelector>;

type Props = {
  formProps: TransferFormProps;
  showCreditAllocation: boolean;
  creditAllocationProps: CreditAllocationSelectorProps;
};

export function TransferSection({ formProps, showCreditAllocation, creditAllocationProps }: Props) {
  return <TransferForm {...formProps} creditAllocationSection={showCreditAllocation ? <CreditAllocationSelector {...creditAllocationProps} /> : null} />;
}
