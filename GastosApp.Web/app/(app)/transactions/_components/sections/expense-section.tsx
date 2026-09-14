import type { ComponentProps } from "react";
import { ExpenseForm } from "../create/expense-form";

type ExpenseFormProps = ComponentProps<typeof ExpenseForm>;

type Props = {
  formProps: ExpenseFormProps;
};

export function ExpenseSection({ formProps }: Props) {
  return <ExpenseForm {...formProps} />;
}
