import { splitLines } from "./strings";

/**
 * Parse SCSS variable definitions from text
 * Extracts variables like: $aux: '.aux'; or $color: #fff;
 */
export function parseScssVariables(text: string): Map<string, string> {
  const variables = new Map<string, string>();
  const lines = splitLines(text);
  
  // Match: $varName: 'value'; or $varName: "value"; or $varName: value;
  const varPattern = /\$([a-zA-Z0-9_-]+)\s*:\s*(['"]?)([^;'"]+)\2\s*;/;
  
  for (const line of lines) {
    const match = varPattern.exec(line);
    if (match) {
      const varName = match[1];
      const value = match[3].trim();
      variables.set(varName, value);
    }
  }
  
  return variables;
}

/**
 * Resolve SCSS interpolation #{$var} to actual value
 * Example: #{$aux} with $aux: '.aux' => .aux
 */
export function resolveInterpolation(
  selector: string, 
  variables: Map<string, string>
): string | null {
  // Match #{$varName}
  const interpolationPattern = /#\{\$([a-zA-Z0-9_-]+)\}/g;
  
  let resolved = selector;
  let hasInterpolation = false;
  
  let match: RegExpExecArray | null;
  while ((match = interpolationPattern.exec(selector))) {
    const varName = match[1];
    const value = variables.get(varName);
    
    if (value) {
      hasInterpolation = true;
      // Replace #{$varName} with value
      resolved = resolved.replace(match[0], value);
    } else {
      // Variable not found, can't resolve
      return null;
    }
  }
  
  return hasInterpolation ? resolved : null;
}

/**
 * Extract class name from resolved selector
 * Example: '.aux' => 'aux', '.nav' => 'nav'
 */
export function extractClassName(selector: string): string | null {
  const cleaned = selector.trim();
  
  // Match .className
  const match = /^\.([a-zA-Z0-9_-]+)$/.exec(cleaned);
  if (match) {
    return match[1];
  }
  
  return null;
}
