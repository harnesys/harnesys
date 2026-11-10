export type FieldType = 'text' | 'secret' | 'textarea' | 'url' | 'select' | 'number' | 'boolean';

export type FieldValue = string | number | boolean;

export interface FieldSelectOption {
  value: string;
  label: string;
}

export interface FieldPattern {
  regex: string;
  hint: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  default?: FieldValue;
  options?: FieldSelectOption[];
  pattern?: FieldPattern;
  editable?: boolean;
  generated?: boolean;
}
