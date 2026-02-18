import { Fragment, useMemo } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { Palette, Check, Sun, Moon } from 'lucide-react';
import { useThemeStore, themes } from '../stores/themeStore';

interface ThemePickerProps {
  expanded?: boolean;
}

export function ThemePicker({ expanded = false }: ThemePickerProps) {
  const { themeId, setTheme, currentTheme, customThemes } = useThemeStore();
  const theme = currentTheme();
  const isDark = theme.isDark;
  const isCustom = themeId.startsWith('custom-');
  const currentBaseName = isCustom ? '' : themeId.replace('-light', '').replace('-dark', '');

  const colorGroups = useMemo(() => {
    return themes
      .filter(t => !t.isDark)
      .map(t => {
        const baseName = t.id.replace('-light', '');
        const darkVariant = themes.find(d => d.id === `${baseName}-dark`);
        return {
          baseName,
          displayName: t.name.replace(' Light', ''),
          lightColor: t.color,
          darkColor: darkVariant?.color || t.color,
        };
      });
  }, []);

  if (expanded) {
    return (
      <div className="space-y-3">
        {/* Light/dark toggle — always rendered to prevent layout shift, disabled when custom */}
        <div className={`flex items-center gap-2 ${isCustom ? 'opacity-40 pointer-events-none' : ''}`}>
          <button
            onClick={() => !isCustom && setTheme(`${currentBaseName}-light`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              !isDark
                ? 'bg-primary-500 text-white'
                : 'bg-surface-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            <Sun className="w-4 h-4" />
            Light
          </button>
          <button
            onClick={() => !isCustom && setTheme(`${currentBaseName}-dark`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              isDark
                ? 'bg-primary-500 text-white'
                : 'bg-surface-tertiary text-text-secondary hover:text-text-primary'
            }`}
          >
            <Moon className="w-4 h-4" />
            Dark
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {colorGroups.map((group) => (
            <button
              key={group.baseName}
              onClick={() =>
                setTheme(`${group.baseName}-${isDark ? 'dark' : 'light'}`)
              }
              className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                !isCustom && currentBaseName === group.baseName
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-border hover:border-primary-300'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full"
                style={{ backgroundColor: isDark ? group.darkColor : group.lightColor }}
              />
              <span className="text-xs text-text-secondary">{group.displayName}</span>
              {!isCustom && currentBaseName === group.baseName && (
                <Check className="absolute top-1 right-1 w-4 h-4 text-primary-500" />
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const handleToggleMode = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCustom) return;
    const newMode = isDark ? 'light' : 'dark';
    setTheme(`${currentBaseName}-${newMode}`);
  };

  return (
    <Menu as="div" className="relative">
      <Menu.Button className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface-tertiary hover:bg-primary-100 text-text-primary rounded-md transition-colors">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: theme.color }}
        />
        <Palette className="w-4 h-4" />
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-1 w-48 bg-surface rounded-md shadow-lg border border-border z-50 overflow-hidden">
          {/* Light/Dark toggle — hidden when custom theme active */}
          {!isCustom && (
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-text-muted uppercase">Mode</span>
              <button
                onClick={handleToggleMode}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-surface-tertiary hover:bg-primary-100 text-text-secondary transition-colors"
              >
                {isDark ? (
                  <>
                    <Moon className="w-3 h-3" />
                    Dark
                  </>
                ) : (
                  <>
                    <Sun className="w-3 h-3" />
                    Light
                  </>
                )}
              </button>
            </div>
          )}
          {/* Built-in color list */}
          <div className="py-1">
            {colorGroups.map((group) => (
              <Menu.Item key={group.baseName}>
                {({ active }) => (
                  <button
                    onClick={() =>
                      setTheme(
                        `${group.baseName}-${isDark ? 'dark' : 'light'}`
                      )
                    }
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm ${
                      active ? 'bg-surface-tertiary' : ''
                    } ${
                      !isCustom && currentBaseName === group.baseName
                        ? 'text-primary-500'
                        : 'text-text-primary'
                    }`}
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{
                        backgroundColor: isDark ? group.darkColor : group.lightColor,
                      }}
                    />
                    {group.displayName}
                    {!isCustom && currentBaseName === group.baseName && (
                      <Check className="w-4 h-4 ml-auto" />
                    )}
                  </button>
                )}
              </Menu.Item>
            ))}
          </div>
          {/* Custom themes section */}
          {customThemes.length > 0 && (
            <>
              <div className="border-t border-border" />
              <div className="px-3 py-1.5">
                <span className="text-xs font-medium text-text-muted uppercase">Custom</span>
              </div>
              <div className="py-1">
                {customThemes.map((ct) => (
                  <Menu.Item key={ct.id}>
                    {({ active }) => (
                      <button
                        onClick={() => setTheme(ct.id)}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm ${
                          active ? 'bg-surface-tertiary' : ''
                        } ${themeId === ct.id ? 'text-primary-500' : 'text-text-primary'}`}
                      >
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: ct.colors['primary-500'] }}
                        />
                        {ct.name}
                        {themeId === ct.id && (
                          <Check className="w-4 h-4 ml-auto" />
                        )}
                      </button>
                    )}
                  </Menu.Item>
                ))}
              </div>
            </>
          )}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
