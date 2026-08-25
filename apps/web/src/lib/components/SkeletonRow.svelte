<div class="row-skeleton">
  <div class="skeleton title-skel"></div>
  <div class="cards-track">
    {#each Array(6) as _, i}
      <div class="card-skel">
        <div class="skeleton poster-skel"></div>
        <div class="skeleton line-1"></div>
        <div class="skeleton line-2"></div>
      </div>
    {/each}
  </div>
</div>

<style>
  .row-skeleton {
    margin: 32px 0 16px;
    padding: 0 22px;
  }
  .title-skel {
    width: 160px;
    height: 24px;
    margin-bottom: 16px;
    border-radius: var(--radius-sm);
  }
  .cards-track {
    display: flex;
    gap: 16px;
    overflow: hidden;
  }
  .card-skel {
    flex: 0 0 150px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .poster-skel {
    aspect-ratio: 2/3;
    width: 100%;
    border-radius: var(--radius-md);
  }
  .line-1 {
    width: 85%;
    height: 14px;
    border-radius: 4px;
  }
  .line-2 {
    width: 50%;
    height: 12px;
    border-radius: 4px;
  }
  @media (max-width: 600px) {
    .row-skeleton {
      padding: 0 16px;
    }
    .card-skel {
      flex: 0 0 120px;
    }
  }
</style>
