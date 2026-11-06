import { Field, FieldLabel } from '@/shared/ui/field';
import { Label } from '@/shared/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group';
import type { TelegramKeywordMatch } from '../model/types';
import { TelegramTermsField } from './telegram-terms-field';

export function TelegramFeedKeywordsField({
  terms,
  match,
  exclude,
  onTerms,
  onMatch,
  onExclude,
}: {
  terms: string[];
  match: TelegramKeywordMatch;
  exclude: string[];
  onTerms: (terms: string[]) => void;
  onMatch: (match: TelegramKeywordMatch) => void;
  onExclude: (exclude: string[]) => void;
}) {
  return (
    <Field>
      <FieldLabel>Keyword filter</FieldLabel>
      <div className="flex flex-col gap-2">
        <TelegramTermsField
          id="telegram-feed-terms"
          label="Terms"
          placeholder="release, open source"
          description="Leave empty to fire on every new post."
          terms={terms}
          testId="telegram-feed-terms-field"
          onChange={onTerms}
        />
        <RadioGroup
          aria-label="Match mode"
          value={match}
          onValueChange={(value) => {
            if (value === 'any' || value === 'all') {
              onMatch(value);
            }
          }}
          className="flex gap-4"
        >
          {(['any', 'all'] as const).map((value) => (
            <Label
              key={value}
              htmlFor={`telegram-feed-match-${value}`}
              className="flex cursor-pointer items-center gap-2 font-normal text-[13px]"
            >
              <RadioGroupItem
                id={`telegram-feed-match-${value}`}
                value={value}
                className="data-checked:border-live data-checked:bg-live data-checked:text-white dark:data-checked:bg-live"
              />
              {value === 'any' ? 'Any term' : 'All terms'}
            </Label>
          ))}
        </RadioGroup>
        <TelegramTermsField
          id="telegram-feed-exclude"
          label="Exclude"
          placeholder="crypto, ads"
          description="Posts containing an excluded term never fire."
          terms={exclude}
          testId="telegram-feed-exclude-field"
          onChange={onExclude}
        />
      </div>
    </Field>
  );
}
