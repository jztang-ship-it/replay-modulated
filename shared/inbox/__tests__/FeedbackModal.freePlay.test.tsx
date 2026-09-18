// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({submit:vi.fn().mockResolvedValue(true),track:vi.fn()}));
vi.mock('../inbox',()=>({getSurveySubmissionNumber:async()=>1,getMessageSubmissionNumber:async()=>1,submitFeedback:m.submit}));
vi.mock('@shared/analytics/analytics',()=>({track:m.track}));
import { FeedbackModal } from '../FeedbackModal';
afterEach(cleanup);
it('offers and submits feedback without monetary copy or a reward dependency',async()=>{
 render(<FeedbackModal userId="test-user" onClose={()=>{}}/>);
 expect(document.body.textContent).not.toMatch(/coin|cash|payout|prize|reward|betting/i);
 fireEvent.click(screen.getByText('📋 Take the quick survey'));
 expect(document.body.textContent).not.toMatch(/coin|cash|payout|prize|reward|betting/i);
 fireEvent.click(screen.getByRole('button',{name:'Send to the team',exact:true}));
 await waitFor(()=>expect(screen.getByText('Thanks for your feedback')).toBeTruthy());
 expect(m.submit).toHaveBeenCalledTimes(1);
 expect(document.body.textContent).not.toMatch(/coin|cash|payout|reward/i);
});
