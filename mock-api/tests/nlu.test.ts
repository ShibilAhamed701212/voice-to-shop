import { describe, it, expect } from 'vitest';
import { detectService, detectPincode, detectDate, detectTime, detectArea, matchProviderName, intents } from '../src/agent/nlu.js';

const REF = '2026-09-20'; // a Sunday

describe('NLU', () => {
  it.each([
    ["My AC isn't cooling", 'AC Repair', 'AC not cooling'],
    ['fridge is not cooling at all', 'Refrigerator Repair', 'Fridge not cooling'],
    ['kitchen tap is leaking', 'Plumbing', 'Tap leaking'],
    ['washing machine drum not spinning', 'Washing Machine Repair', 'Drum not spinning'],
    ['the fan stopped working', 'Electrical', 'Fan repair'],
    ['need a deep home cleaning', 'Cleaning', 'Deep home cleaning'],
    ['door lock is broken', 'Carpentry', 'Door lock installation'],
    ['TV screen is blank', 'TV Repair', 'LED screen blank'],
    ['Mera AC thanda nahi kar raha', 'AC Repair', 'AC not cooling']
  ])('detects service in "%s"', (text, service, problem) => {
    expect(detectService(text)).toEqual({ service, problem });
  });

  it('detects pincodes from speech-to-text variants', () => {
    expect(detectPincode('560064')).toBe('560064');
    expect(detectPincode('my pin is 560 064')).toBe('560064');
    expect(detectPincode('five six zero zero six four')).toBe('560064');
    expect(detectPincode('five six zero double zero one')).toBe('560001');
    expect(detectPincode('at 6 pm tomorrow')).toBeNull();
  });

  it('detects areas', () => {
    const areas = [{ pincode: '560076', area: 'BTM Layout' }, { pincode: '560001', area: 'MG Road / Shivajinagar' }];
    expect(detectArea('I live in BTM', areas)?.pincode).toBe('560076');
    expect(detectArea('near shivajinagar', areas)?.pincode).toBe('560001');
  });

  it('parses relative and absolute dates', () => {
    expect(detectDate('tomorrow evening', REF)).toBe('2026-09-21');
    expect(detectDate('kal shaam', REF)).toBe('2026-09-21');
    expect(detectDate('day after tomorrow', REF)).toBe('2026-09-22');
    expect(detectDate('today', REF)).toBe('2026-09-20');
    expect(detectDate('on wednesday', REF)).toBe('2026-09-23');
    expect(detectDate('next sunday', REF)).toBe('2026-09-27');
    expect(detectDate('on the 25th', REF)).toBe('2026-09-25');
    expect(detectDate('the 3rd one', REF)).toBeNull();
    expect(detectDate('5th october', REF)).toBe('2026-10-05');
    expect(detectDate('this weekend', REF)).toBe('2026-09-26');
    expect(detectDate('no date here', REF)).toBeNull();
  });

  it('parses times', () => {
    expect(detectTime('at 6 pm').time).toBe('18:00');
    expect(detectTime('6:30pm').time).toBe('18:30');
    expect(detectTime('around 7').time).toBe('19:00');
    expect(detectTime('at 10').time).toBe('10:00');
    expect(detectTime('18:00').time).toBe('18:00');
    expect(detectTime('tomorrow morning').time).toBe('10:00');
    expect(detectTime('evening').time).toBe('18:00');
    expect(detectTime('shaam 7 baje').time).toBe('19:00');
    expect(detectTime('earliest available').flexible).toBe(true);
    expect(detectTime('560064').time).toBeNull();
  });

  it('matches provider names', () => {
    const names = ['Rahul Kumar', 'Arun Services', 'CoolBreeze Air Care'];
    expect(matchProviderName('Yes, Rahul Kumar', names)).toBe(0);
    expect(matchProviderName('go with arun', names)).toBe(1);
    expect(matchProviderName('coolbreeze please', names)).toBe(2);
    expect(matchProviderName('yes', names)).toBeNull();
  });

  it('classifies intents', () => {
    expect(intents.affirm('Yes, book him.')).toBe(true);
    expect(intents.affirm('haan theek hai')).toBe(true);
    expect(intents.deny('no, not that one')).toBe(true);
    expect(intents.cancelBooking('please cancel my booking')).toBe(true);
    expect(intents.reschedule('can we postpone it')).toBe(true);
  });
});
