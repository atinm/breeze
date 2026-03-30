import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type PartnerOption = {
  id: string;
  name: string;
  slug?: string;
  status?: string;
};

type Props = {
  partners: PartnerOption[];
  selectedPartnerId: string | null;
  onSelect: (partnerId: string | null) => void;
  placeholder?: string;
  title?: string;
  className?: string;
  dropdownClassName?: string;
  compact?: boolean;
};

export default function PartnerCombobox({
  partners,
  selectedPartnerId,
  onSelect,
  placeholder = 'Select Partner',
  title,
  className,
  dropdownClassName,
  compact = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId],
  );

  const filteredPartners = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return partners;

    return partners.filter((partner) =>
      partner.name.toLowerCase().includes(normalizedQuery)
      || (partner.slug ?? '').toLowerCase().includes(normalizedQuery)
      || (partner.status ?? '').toLowerCase().includes(normalizedQuery),
    );
  }, [partners, query]);

  useEffect(() => {
    if (!isOpen) return;

    setHighlightedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (highlightedIndex >= filteredPartners.length) {
      setHighlightedIndex(Math.max(0, filteredPartners.length - 1));
    }
  }, [filteredPartners.length, highlightedIndex]);

  const handleSelect = (partnerId: string) => {
    onSelect(partnerId);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = () => {
    onSelect(null);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className={cn(
          'flex items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted',
          compact ? 'h-9 min-w-[220px]' : 'h-9 min-w-[260px] w-full',
        )}
        title={title ?? placeholder}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">
            {selectedPartner ? `${selectedPartner.name}${selectedPartner.slug ? ` (${selectedPartner.slug})` : ''}` : placeholder}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen ? (
        <div className={cn('absolute left-0 top-full z-50 mt-1 w-full rounded-md border bg-popover p-2 shadow-lg', dropdownClassName)}>
          <div className="flex items-center gap-2 rounded-md border bg-background px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setHighlightedIndex((prev) => Math.min(prev + 1, Math.max(filteredPartners.length - 1, 0)));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setHighlightedIndex((prev) => Math.max(prev - 1, 0));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  const highlighted = filteredPartners[highlightedIndex];
                  if (highlighted) handleSelect(highlighted.id);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setIsOpen(false);
                  setQuery('');
                }
              }}
              placeholder="Search partners"
              className="h-9 w-full bg-transparent text-sm outline-none"
            />
            {selectedPartnerId ? (
              <button
                type="button"
                onClick={handleClear}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Clear partner selection"
                aria-label="Clear partner selection"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
            {filteredPartners.length === 0 ? (
              <div className="rounded-md px-3 py-4 text-center text-sm text-muted-foreground">
                No partners match your search.
              </div>
            ) : (
              filteredPartners.map((partner, index) => (
                <button
                  key={partner.id}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => handleSelect(partner.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                    index === highlightedIndex && 'bg-muted',
                  )}
                  role="option"
                  aria-selected={partner.id === selectedPartnerId}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{partner.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {partner.slug ?? partner.id}
                      {partner.status ? ` · ${partner.status}` : ''}
                    </div>
                  </div>
                  {partner.id === selectedPartnerId ? <Check className="h-4 w-4 flex-none text-primary" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
