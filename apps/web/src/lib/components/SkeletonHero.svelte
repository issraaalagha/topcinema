<div class="hero-skeleton">
  <div class="hero-content">
    <div class="skeleton badge-skel"></div>
    <div class="skeleton title-skel"></div>
    <div class="skeleton meta-skel"></div>
    <div class="skeleton desc-skel"></div>
    <div class="skeleton-btns">
      <div class="skeleton btn-skel-primary"></div>
      <div class="skeleton btn-skel-secondary"></div>
    </div>
  </div>
</div>

<style>
  .hero-skeleton {
    position: relative;
    width: 100%;
    min-height: 480px;
    background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg) 100%);
    display: flex;
    align-items: flex-end;
    padding: 48px 32px 36px;
    margin-bottom: 24px;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    overflow: hidden;
  }
  .hero-content {
    max-width: 600px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .badge-skel {
    width: 90px;
    height: 26px;
    border-radius: var(--radius-pill);
  }
  .title-skel {
    width: 75%;
    height: 44px;
    border-radius: var(--radius-sm);
  }
  .meta-skel {
    width: 45%;
    height: 20px;
    border-radius: var(--radius-sm);
  }
  .desc-skel {
    width: 90%;
    height: 52px;
    border-radius: var(--radius-sm);
  }
  .skeleton-btns {
    display: flex;
    gap: 14px;
    margin-top: 8px;
  }
  .btn-skel-primary {
    width: 150px;
    height: 44px;
    border-radius: var(--radius-md);
  }
  .btn-skel-secondary {
    width: 140px;
    height: 44px;
    border-radius: var(--radius-md);
  }
  @media (max-width: 768px) {
    .hero-skeleton {
      min-height: 360px;
      padding: 24px 18px 24px;
    }
    .title-skel {
      width: 90%;
      height: 32px;
    }
  }
</style>
