"use client";
import {
  Children,
  isValidElement,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";

export function ChoiceSelect({
  value,
  defaultValue,
  onValueChange,
  children,
  disabled,
  required,
  name,
  id,
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((item) => {
      const props = item.props as {
        value: string | number;
        children: ReactNode;
        disabled?: boolean;
        required?: boolean;
        "data-group"?: string;
      };
      // Native <option> accepts numeric IDs; form and Radix values are strings.
      return {
        ...props,
        value:
          typeof props.value === "number" ? String(props.value) : props.value,
      };
    });
  const [local, setLocal] = useState(defaultValue ?? options[0]?.value ?? "");
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const bindTrigger = useCallback((node: HTMLButtonElement | null) => {
    if (node) setPortalContainer(node.closest("dialog") ?? undefined);
  }, []);
  const selected = value ?? local;
  return (
    <>
      {name && (
        <input type="hidden" name={name} value={selected} disabled={disabled} />
      )}
      <Menu.Root>
        <Menu.Trigger
          ref={bindTrigger}
          id={id}
          disabled={disabled}
          className="choice-trigger"
          aria-label={ariaLabel}
          aria-required={required}
        >
          <span>
            {options.find((o) => o.value === selected)?.children ?? "Choose"}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal container={portalContainer}>
          <Menu.Content
            className="choice-menu"
            sideOffset={6}
            collisionPadding={16}
            align="start"
          >
            <Menu.RadioGroup
              value={selected}
              onValueChange={(next) => {
                setLocal(next);
                onValueChange?.(next);
              }}
            >
              {options.map((option, index) => (
                <span key={option.value}>
                  {option["data-group"] &&
                    option["data-group"] !==
                      options[index - 1]?.["data-group"] && (
                      <Menu.Label className="choice-group">
                        {option["data-group"]}
                      </Menu.Label>
                    )}
                  <Menu.RadioItem
                    value={option.value}
                    disabled={option.disabled}
                    className="choice-option"
                  >
                    <span>{option.children}</span>
                    <Menu.ItemIndicator>
                      <Check size={17} aria-hidden="true" />
                    </Menu.ItemIndicator>
                  </Menu.RadioItem>
                </span>
              ))}
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
