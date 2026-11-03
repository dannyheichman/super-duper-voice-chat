// target-adapter.interface.ts
// Purpose : Contract every voice target (Copilot CLI SDK, VS Code, ACP...) must implement.
// Inputs  : prompt text; approval decisions from the voice engine.
// Outputs : TargetAdapterEvent stream (reasoning, answer, approval, idle, error).
// Depends : none.

export type TargetAdapterEvent =
  | { readonly type: 'reasoningDelta'; readonly text: string }
  | { readonly type: 'answerDelta'; readonly text: string }
  | { readonly type: 'approvalRequested'; readonly summary: string; readonly isDestructive: boolean }
  | { readonly type: 'turnCompleted' }
  | { readonly type: 'turnFailed'; readonly message: string };

export interface TargetAdapter {
  startAdapter(): Promise<void>;
  sendPrompt(promptText: string): Promise<void>;
  respondToApproval(shouldApprove: boolean): void;
  abortTurn(): Promise<void>;
  stopAdapter(): Promise<void>;
  onEvent(listener: (event: TargetAdapterEvent) => void): void;
}
