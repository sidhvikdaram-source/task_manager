const explicitWorkspaceChangePattern =
  /\b(add|create|save|schedule|reschedule|move|rename|edit|update|change|archive|delete|remove|reorder|assign|unassign|send|message|make)\b/i;

const impliedTaskCapturePattern =
  /\b(remind me|remember to|don't let me forget|dont let me forget|i need to|i have to|i've got to|ive got to|put (?:this|that|it) (?:in|on))\b/i;

export function hasWorkspaceMutationIntent(message: string) {
  return explicitWorkspaceChangePattern.test(message) || impliedTaskCapturePattern.test(message);
}
