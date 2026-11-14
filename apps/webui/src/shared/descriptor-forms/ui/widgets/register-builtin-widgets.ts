import { registerFormWidget } from '../widget-registry';
import { ChipsWidget } from './chips-widget.tsx';
import { ComboboxWidget } from './combobox-widget.tsx';
import { SwitchWidget } from './switch-widget.tsx';
import { TagsWidget } from './tags-widget.tsx';

/**
 * Built-in widgets, available to every descriptor form: trigger config,
 * add-on configuration, view forms. Add-ons declare the `kind` in their
 * descriptor; unknown hosts fall back to the base field type.
 */
export function registerBuiltinFormWidgets(): void {
  registerFormWidget('chips', ChipsWidget);
  registerFormWidget('switch', SwitchWidget);
  registerFormWidget('tags', TagsWidget);
  registerFormWidget('combobox', ComboboxWidget);
}
