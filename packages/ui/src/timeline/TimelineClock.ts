// Часы повтора — вне React. Время повтора меняется 60 раз в секунду; если бы оно жило в состоянии
// React, каждый кадр перерисовывал бы весь экран. Здесь часы только сообщают подписчикам о кадре:
// «Поток» рисует его прямо в SVG, а React перерисовывается, лишь когда сменилось то, что он
// показывает (число событий до курсора, «играет / пауза»).

export interface ClockState {
  // Время повтора, мс.
  time: number;
  playing: boolean;
  speed: number;
  // Курсор следует за концом: живая сессия идёт «сейчас», трейс открыт целиком.
  following: boolean;
}

export class TimelineClock {
  private state: ClockState = { time: 0, playing: false, speed: 1, following: true };
  private total = 0;
  // Живая сессия: кадры нужны и без воспроизведения — идёт счётчик ожидания.
  private live = false;
  private readonly listeners = new Set<() => void>();
  private frame: number | null = null;
  private lastFrameAt = 0;

  getState = (): ClockState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setTotal(total: number): void {
    this.total = total;
    const time = this.state.following ? total : Math.min(this.state.time, total);
    this.update({ time });
  }

  setLive(live: boolean): void {
    this.live = live;
    this.ensureLoop();
  }

  play(): void {
    // С конца — повтор с начала.
    const time = this.state.time >= this.total ? 0 : this.state.time;
    this.update({ time, playing: true, following: false });
  }

  pause(): void {
    this.update({ playing: false });
  }

  seek(time: number): void {
    this.update({
      time: Math.max(0, Math.min(this.total, time)),
      playing: false,
      following: false,
    });
  }

  follow(): void {
    this.update({ time: this.total, playing: false, following: true });
  }

  setSpeed(speed: number): void {
    this.update({ speed });
  }

  dispose(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.listeners.clear();
  }

  private update(change: Partial<ClockState>): void {
    this.state = { ...this.state, ...change };
    this.emit();
    this.ensureLoop();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private ensureLoop(): void {
    const needed = this.state.playing || (this.live && this.state.following);
    if (needed && this.frame === null) {
      this.lastFrameAt = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private readonly tick = (now: number): void => {
    this.frame = null;
    const elapsed = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (this.state.playing) {
      const time = Math.min(this.total, this.state.time + elapsed * this.state.speed);
      // Дошли до конца — дальше «следим за концом»: в живой сессии так и продолжится.
      this.state =
        time >= this.total
          ? { ...this.state, time, playing: false, following: true }
          : { ...this.state, time };
    }
    this.emit();
    this.ensureLoop();
  };
}
