export interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  locale: string | null;
  is_active: boolean;
  last_login_at: string | null;
  object_count?: number;
}

export interface LearningObject {
  id: number;
  public_id: string;
  type: string;
  title: string;
  description: string;
  owner: { id: number; name: string; username: string };
  published_at: string | null;
  has_changes: boolean;
  created_at: string;
  updated_at: string;
  content?: any;
}

export interface Attempt {
  id: number;
  learner: string;
  lms: string | null;
  course: string | null;
  status: string;
  progress: number;
  score: number | null;
  passback_status: string;
  passback_error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface Connection {
  id: number;
  name: string;
  version: '1.1' | '1.3';
  is_active: boolean;
  consumer_key: string | null;
  shared_secret: string | null;
  issuer: string | null;
  client_id: string | null;
  deployment_ids: string | null;
  auth_login_url: string | null;
  auth_token_url: string | null;
  keyset_url: string | null;
}

export interface EmbedInfo {
  lti11: { launch_url: string };
  lti13: { target_link_uri: string; custom_parameters: string };
  tool: { login_url: string; redirect_url: string; jwks_url: string; deep_linking_url: string };
  connections: { name: string; version: string }[];
}

export interface Question {
  id: string;
  type: 'single' | 'multiple' | 'truefalse' | 'text';
  text: string;
  points?: number;
  feedback?: string;
  options: { id: string; text: string; correct?: boolean; feedback?: string }[];
  accepted?: string[];
}

export interface QuestionReview {
  id: string;
  correct: boolean;
  feedback: string;
  correctOptions: string[];
  optionFeedback: Record<string, string>;
  accepted: string[];
}

export type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'question'; question: Question }
  | { kind: 'reveal'; title: string; text: string }
  | { kind: 'callout'; variant: 'info' | 'tip' | 'warning'; text: string }
  | { kind: 'flipcards'; cards: { front: string; back: string }[] }
  | { kind: 'error'; message: string };

export interface PlayAttempt {
  status: 'in_progress' | 'completed';
  progress: number;
  state: any;
  result: { score: number; passed: boolean | null; detail: any } | null;
  passback_status: string;
}

export interface PlaySession {
  preview: boolean;
  locale: string | null;
  learner: { name: string | null; role: string };
  object: { type: string; title: string; description: string; content: any };
  attempt: PlayAttempt;
  can_retake: boolean;
}
