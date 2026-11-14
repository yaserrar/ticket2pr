'use client';

import * as React from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { SecretInput } from './secret-input';

/**
 * react-hook-form + shadcn Field in one line:
 *   <FormField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
 * `render` lets you plug any control: render={(field) => <Select … />}.
 */
type Props<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label?: React.ReactNode;
  description?: React.ReactNode;
  labelAside?: React.ReactNode;
  /** `password` renders a secret input with a show/hide toggle (API keys, tokens). */
  type?: 'text' | 'email' | 'password' | 'textarea' | 'url' | 'number';
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  render?: (field: {
    id: string;
    value: unknown;
    onChange: (v: unknown) => void;
    onBlur: () => void;
    name: string;
    invalid: boolean;
  }) => React.ReactNode;
};

export function FormField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  labelAside,
  type = 'text',
  placeholder,
  autoComplete,
  autoFocus,
  disabled,
  className,
  render,
}: Props<T>) {
  const id = React.useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = Boolean(fieldState.error);
        const common = {
          id,
          name: field.name,
          onBlur: field.onBlur,
          disabled,
          placeholder,
          autoComplete,
          autoFocus,
          'aria-invalid': invalid || undefined,
          'aria-describedby': invalid ? `${id}-error` : description ? `${id}-description` : undefined,
        };
        return (
          <Field data-invalid={invalid || undefined} className={className}>
            {label ? (
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                {labelAside}
              </div>
            ) : null}
            {render ? (
              render({ id, value: field.value, onChange: field.onChange, onBlur: field.onBlur, name: field.name, invalid })
            ) : type === 'password' ? (
              <SecretInput {...common} ref={field.ref} value={field.value ?? ''} onChange={field.onChange} />
            ) : type === 'textarea' ? (
              <Textarea {...common} ref={field.ref} value={field.value ?? ''} onChange={field.onChange} />
            ) : (
              <Input {...common} ref={field.ref} type={type} value={field.value ?? ''} onChange={field.onChange} />
            )}
            {description && !invalid ? <FieldDescription id={`${id}-description`}>{description}</FieldDescription> : null}
            <FieldError id={`${id}-error`} errors={[fieldState.error]} />
          </Field>
        );
      }}
    />
  );
}

/** Form-level error banner (server errors that don't map to a field). */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-danger/25 bg-danger-subtle px-3 py-2.5 text-sm text-danger-muted">
      {message}
    </div>
  );
}
