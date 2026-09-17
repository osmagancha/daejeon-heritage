/* ══════════════════════════════════════════════════════════════════
   겨루기 화면 — 판정은 서버가 하고, 여기서는 결과를 보여 주기만 한다.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const esc = (s) => Util.esc(s);
  const num = (n) => Number(n || 0).toLocaleString();

  const STAT_ICON = { str: '💪', agi: '🏃', vit: '🛡️', spi: '✨' };

  /* ─────────────────────────── 도전 ─────────────────────────── */

  function arena(d, foes) {
    const left = foes.today.left;

    const npcCard = (n) => `
      <button class="foe-card npc" data-fight="${n.id}" ${left ? '' : 'disabled'}>
        <span class="foe-face">${n.emoji}</span>
        <div class="foe-body">
          <b>${esc(n.name)}</b>
          <span class="foe-line">${esc(n.line)}</span>
        </div>
        <span class="foe-pow">${num(n.power)}</span>
      </button>`;

    const playerCard = (p) => `
      <button class="foe-card" data-fight="${p.id}" ${left ? '' : 'disabled'}>
        <span class="rank-av" style="background:${Util.avatarBg(p.avatarSeed)}">${esc(p.nickname[0])}</span>
        <div class="foe-body">
          <b>${esc(p.nickname)}${p.friend ? '<em class="friend-tag">친구</em>' : ''}</b>
          <span class="foe-line">${esc(p.title)} · ${num(p.rating)} · ${esc(p.weapon)}${p.plus ? ' +' + p.plus : ''}</span>
        </div>
        <span class="foe-pow">${num(p.power)}</span>
      </button>`;

    return `
      <div class="arena-me">
        <div class="arena-me-top">
          <span class="rank-av" style="background:${Util.avatarBg(d.avatarSeed)}">${esc(d.nickname[0])}</span>
          <div style="flex:1;min-width:0">
            <div class="rank-name">${esc(d.nickname)} <em class="title-tag">${esc(d.record.title.name)}</em></div>
            <div class="rank-sub">${esc(d.weapon.name)}${d.weapon.plus ? ' +' + d.weapon.plus : ''} · ${d.record.wins}승 ${d.record.losses}패 ${d.record.draws}무</div>
          </div>
          <div class="arena-pow"><b>${num(d.power)}</b><span>전투력</span></div>
        </div>
        <div class="arena-bar">
          <span>오늘 남은 겨루기</span>
          <b class="${left ? '' : 'out'}">${left} / ${foes.today.limit}회</b>
        </div>
      </div>

      ${left ? '' : '<p class="arena-note">오늘 겨룰 수 있는 횟수를 다 썼습니다. 자정이 지나면 다시 채워집니다. 옥으로 5회를 더 살 수도 있습니다.</p>'}

      ${foes.friends.length ? `
        <div class="section-h"><h3>친구</h3><span>${foes.friends.length}명</span></div>
        <div class="foe-list">${foes.friends.map(playerCard).join('')}</div>` : ''}

      <div class="section-h"><h3>수련 상대</h3><span>등급에 영향 없음</span></div>
      <div class="foe-list">${foes.npcs.map(npcCard).join('')}</div>

      <div class="section-h"><h3>겨룰 사람</h3><span>실력이 비슷한 순</span></div>
      ${foes.players.length
        ? `<div class="foe-list">${foes.players.map(playerCard).join('')}</div>`
        : '<p class="arena-note">아직 겨룰 사람이 없습니다. 수련 상대와 먼저 몸을 풀어 보세요.</p>'}`;
  }

  /* ─────────────────────── 전투 재생 화면 ─────────────────────── */

  function fightStage(f) {
    const bar = (side, c, name, face) => `
      <div class="fs-side ${side}">
        <span class="fs-face">${face}</span>
        <b class="fs-name">${esc(name)}</b>
        <div class="fs-hp"><i id="hp-${side}" style="width:100%"></i></div>
        <span class="fs-hpnum" id="hpn-${side}">${c.hp}</span>
      </div>`;

    return `
      <div class="fight-stage" id="fight-stage">
        <div class="fs-row">
          ${bar('a', f.me.combat, f.me.name, '🧑')}
          <span class="fs-vs">…</span>
          ${bar('b', f.foe.combat, f.foe.name, f.foe.emoji || '🧑')}
        </div>
        <div class="fs-log" id="fs-log"></div>
        <div class="fs-result" id="fs-result" hidden></div>
      </div>`;
  }

  /** 로그를 한 줄씩 재생한다 */
  function playFight(f, onDone) {
    const hpA = document.getElementById('hp-a');
    const hpB = document.getElementById('hp-b');
    const nA = document.getElementById('hpn-a');
    const nB = document.getElementById('hpn-b');
    const logBox = document.getElementById('fs-log');
    const vs = document.querySelector('.fs-vs');
    const resultBox = document.getElementById('fs-result');
    if (!hpA || !logBox) return;

    const maxA = f.me.combat.hp;
    const maxB = f.foe.combat.hp;
    let i = 0;
    let stopped = false;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = reduced ? 0 : 420;

    function line(html, cls) {
      const el = document.createElement('div');
      el.className = 'fs-line ' + (cls || '');
      el.innerHTML = html;
      logBox.appendChild(el);
      logBox.scrollTop = logBox.scrollHeight;
    }

    function finish() {
      const r = f.result;
      const won = r.winner === 'a';
      const draw = r.winner === 'draw';
      resultBox.hidden = false;
      resultBox.className = 'fs-result ' + (draw ? 'draw' : (won ? 'win' : 'lose'));
      resultBox.innerHTML = `
        <b>${draw ? '비겼습니다' : (won ? '이겼습니다' : '졌습니다')}</b>
        <div class="fs-reward">
          <span>+${num(f.reward.points)}P</span>
          ${f.reward.rating ? `<span class="${f.reward.rating > 0 ? 'up' : 'down'}">${f.reward.rating > 0 ? '▲' : '▼'} ${Math.abs(f.reward.rating)}</span>` : ''}
          ${f.reward.gems ? `<span class="gem">옥 +${f.reward.gems}</span>` : ''}
          ${f.reward.streak > 1 ? `<span class="streak">🔥 ${f.reward.streak}연승</span>` : ''}
        </div>
        <div class="btn-row">
          <button class="btn soft" data-act="battle-again">다시 고르기</button>
        </div>`;
      if (onDone) onDone();
    }

    function next() {
      if (stopped) return;
      if (i >= f.log.length) return finish();
      const e = f.log[i++];

      if (e.kind === 'start') {
        line(`<b>${esc(e.first === 'a' ? f.me.name : f.foe.name)}</b> 이(가) 먼저 나선다.`, 'sys');
      } else if (e.kind === 'hit') {
        const attacker = e.by === 'a' ? f.me.name : f.foe.name;
        const target = e.by === 'a' ? f.foe.name : f.me.name;
        if (e.by === 'a') {
          hpB.style.width = Math.max(0, (e.hp / maxB) * 100) + '%';
          nB.textContent = e.hp;
        } else {
          hpA.style.width = Math.max(0, (e.hp / maxA) * 100) + '%';
          nA.textContent = e.hp;
        }
        const el = document.querySelector('.fs-side.' + (e.by === 'a' ? 'b' : 'a'));
        if (el && !reduced) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
        line(`${esc(attacker)} → ${esc(target)} <b class="${e.crit ? 'crit' : ''}">${e.dmg}</b>${e.crit ? ' <span class="crit-tag">치명</span>' : ''}`,
             e.by === 'a' ? 'mine' : 'theirs');
      } else if (e.kind === 'dodge') {
        const who = e.by === 'a' ? f.me.name : f.foe.name;
        line(`${esc(who)} 이(가) 피했다.`, 'sys');
      } else if (e.kind === 'timeout') {
        line('시간이 다 되었다. 남은 기력으로 가린다.', 'sys');
      } else if (e.kind === 'end') {
        if (vs) vs.textContent = e.winner === 'draw' ? '무' : (e.winner === 'a' ? '승' : '패');
      }
      setTimeout(next, step);
    }
    next();
    return () => { stopped = true; };
  }

  /* ─────────────────────────── 내 무사 ─────────────────────────── */

  function mine(d) {
    const sp = d.statPoints;
    const statRow = (s) => {
      const val = d.stats[s.key] || 0;
      const total = d.base[s.key] + val;
      return `
        <div class="stat-row-b">
          <span class="stat-ic">${STAT_ICON[s.key]}</span>
          <div style="flex:1;min-width:0">
            <b>${esc(s.name)} <span class="stat-hanja">${esc(s.hanja)}</span></b>
            <span class="stat-desc">${esc(s.desc)}</span>
          </div>
          <span class="stat-val">${total}<em>${val ? '+' + val : ''}</em></span>
          <button class="stat-plus" data-stat="${s.key}" ${sp.left ? '' : 'disabled'}>+</button>
        </div>`;
    };

    const c = d.combat;
    return `
      <div class="stat-head">
        <div>
          <b>남은 스탯 점수</b>
          <span>단계마다 ${sp.perLevel}점씩 받습니다</span>
        </div>
        <span class="stat-left ${sp.left ? 'has' : ''}">${sp.left}</span>
      </div>
      ${sp.left ? `<div class="stat-pending" id="stat-pending" hidden></div>` : ''}

      <div class="stat-list">${d.statDefs.map(statRow).join('')}</div>

      <div class="section-h"><h3>지금 수치</h3><span>무기 포함</span></div>
      <div class="adm-tiles">
        ${[['전투력', num(d.power), ''], ['체력', num(c.hp), ''], ['공격력', c.atk, ''],
           ['방어', c.guard, ''], ['회피', (c.dodge * 100).toFixed(0), '%'], ['치명타', (c.crit * 100).toFixed(0), '%']]
          .map(([k, v, u]) => `<div class="adm-tile"><b>${v}<i>${u}</i></b><span>${k}</span></div>`).join('')}
      </div>

      <div class="btn-row">
        <button class="btn line wide" data-act="stat-reset">스탯 초기화 (3,000P 또는 옥 5)</button>
      </div>`;
  }

  /* ─────────────────────────── 대장간 ─────────────────────────── */

  function forge(d, shop) {
    const e = d.enhance;
    const w = d.weapon;
    const maxed = w.plus >= e.max;

    return `
      <div class="forge-top">
        <div class="forge-weapon">
          <span class="forge-ic">⚔️</span>
          <div style="flex:1;min-width:0">
            <b>${esc(w.name)} <span class="stat-hanja">${esc(w.hanja || '')}</span></b>
            <span class="stat-desc">${esc(w.desc || '')}</span>
          </div>
          <span class="forge-plus ${w.plus >= 7 ? 'hot' : ''}">+${w.plus}</span>
        </div>
        <div class="forge-atk">
          <span>무기 공격력</span>
          <b>${d.combat.weapon.atk}</b>
        </div>
      </div>

      ${maxed
        ? '<p class="arena-note">더는 강화할 수 없습니다. 최고 단계입니다.</p>'
        : `<div class="forge-panel">
            <div class="forge-line"><span>성공 확률</span><b>${(e.rate * 100).toFixed(0)}%</b></div>
            <div class="forge-line"><span>드는 비용</span><b>${num(e.cost)}P</b></div>
            <div class="forge-line"><span>실패하면</span><b>${w.plus >= e.dropFrom ? '한 단계 내려갑니다' : '그대로입니다'}</b></div>
            <div class="forge-line"><span>가진 부적</span><b>${d.charms}장 ${d.charms ? '(성공률 +15%)' : ''}</b></div>
            <div class="forge-line"><span>가진 보호권</span><b>${d.guards}장 ${d.guards ? '(내려가는 것을 막습니다)' : '(옥 상점에서 삽니다)'}</b></div>
            ${w.plus >= e.dropFrom ? `
              <label class="forge-guard ${d.guards ? '' : 'off'}">
                <input type="checkbox" id="use-guard" ${d.guards ? 'checked' : 'disabled'} />
                <span>보호권 쓰기 — 실패해도 +${w.plus} 을 지킵니다${d.guards ? '' : ' (없음)'}</span>
              </label>` : ''}
            <div class="btn-row">
              <button class="btn red" style="flex:2" data-act="enhance">강화하기</button>
              <button class="btn soft" data-act="enhance-charm" ${d.charms ? '' : 'disabled'}>부적 쓰기</button>
            </div>
          </div>`}

      <div id="forge-result"></div>

      <div class="section-h"><h3>무기 상점</h3><span>${num(shop.points)}P 보유</span></div>
      <div class="weapon-list">
        ${shop.rows.map((x) => `
          <div class="weapon-row ${x.key === shop.equipped ? 'on' : ''}">
            <div style="flex:1;min-width:0">
              <b>${esc(x.name)} <span class="stat-hanja">${esc(x.hanja)}</span></b>
              <span class="stat-desc">${esc(x.desc)}</span>
              <span class="weapon-meta">공격 ${x.atk} · ${esc(({ str: '힘', agi: '민첩', spi: '기' })[x.scale])} 계열 · ${x.level}단계부터</span>
            </div>
            <div class="weapon-act">
              ${x.owned
                ? (x.key === shop.equipped
                    ? '<span class="weapon-tag">장착 중</span>'
                    : `<button class="btn soft" data-equip="${x.key}">장착</button>`)
                : `<button class="btn ${x.canLevel && x.canAfford ? 'red' : 'line'}" data-buy-weapon="${x.key}"
                     ${x.canLevel ? '' : 'disabled'}>${num(x.price)}P</button>`}
              ${x.owned || x.canLevel ? '' : `<span class="weapon-lock">${x.level}단계 필요</span>`}
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* ─────────────────────────── 기록 ─────────────────────────── */

  function history(rows) {
    if (!rows.length) return '<p class="arena-note">아직 겨룬 기록이 없습니다.</p>';
    return `<div class="bt-history">
      ${rows.map((r) => `
        <div class="bt-row ${r.result}">
          <span class="bt-mark">${r.result === 'win' ? '승' : r.result === 'lose' ? '패' : '무'}</span>
          <div style="flex:1;min-width:0">
            <div class="rank-name">${esc(r.opponent)}${r.npc ? '<em class="npc-tag">수련</em>' : ''}</div>
            <div class="rank-sub">${Util.ago(r.at)}</div>
          </div>
          <span class="bt-delta">
            ${r.earned ? `+${r.earned}P` : ''}
            ${r.delta ? `<em class="${r.delta > 0 ? 'up' : 'down'}">${r.delta > 0 ? '▲' : '▼'}${Math.abs(r.delta)}</em>` : ''}
          </span>
        </div>`).join('')}
    </div>`;
  }

  /* ─────────────────────────── 친구 ─────────────────────────── */

  function friends(d) {
    return `
      <div class="field" style="margin-bottom:18px">
        <label>이름으로 친구 신청</label>
        <div style="display:flex;gap:8px">
          <input id="friend-name" placeholder="상대의 이름" maxlength="16" style="flex:1" />
          <button class="btn red" style="flex:none" data-act="friend-add">신청</button>
        </div>
      </div>

      ${d.incoming.length ? `
        <div class="section-h"><h3>받은 신청</h3><span>${d.incoming.length}건</span></div>
        ${d.incoming.map((r) => `
          <div class="friend-row">
            <span class="rank-av" style="background:${Util.avatarBg(r.avatarSeed)}">${esc(r.nickname[0])}</span>
            <div style="flex:1;min-width:0">
              <div class="rank-name">${esc(r.nickname)}</div>
              <div class="rank-sub">${Util.ago(r.at)}</div>
            </div>
            <button class="btn red" style="height:34px;padding:0 12px;font-size:12.5px" data-friend-yes="${r.id}">수락</button>
            <button class="btn line" style="height:34px;padding:0 10px;font-size:12.5px" data-friend-no="${r.id}">거절</button>
          </div>`).join('')}` : ''}

      ${d.outgoing.length ? `
        <div class="section-h"><h3>보낸 신청</h3><span>${d.outgoing.length}건</span></div>
        ${d.outgoing.map((r) => `
          <div class="friend-row muted">
            <span class="rank-av" style="background:var(--line)">·</span>
            <div style="flex:1"><div class="rank-name">${esc(r.nickname)}</div>
              <div class="rank-sub">답을 기다리는 중</div></div>
          </div>`).join('')}` : ''}

      <div class="section-h"><h3>친구</h3><span>${d.friends.length}명</span></div>
      ${d.friends.length ? d.friends.map((f) => `
        <div class="friend-row">
          <span class="rank-av" style="background:${Util.avatarBg(f.avatarSeed)}">${esc(f.nickname[0])}</span>
          <div style="flex:1;min-width:0">
            <div class="rank-name">${esc(f.nickname)}</div>
            <div class="rank-sub">${f.level}단계 · ${esc(f.title)} ${num(f.rating)} · 스탬프 ${f.stamps}</div>
          </div>
          <button class="btn soft" style="height:34px;padding:0 12px;font-size:12.5px" data-fight="${f.id}">겨루기</button>
          <button class="btn line" style="height:34px;padding:0 10px;font-size:12.5px" data-friend-del="${f.id}">삭제</button>
        </div>`).join('')
        : '<p class="arena-note">아직 친구가 없습니다. 위에 이름을 적어 신청해 보세요.</p>'}`;
  }

  /* ─────────────────────────── 옥 상점 ─────────────────────────── */

  function gemShop(d) {
    return `
      <div class="gem-head">
        <span class="gem-ic">🔷</span>
        <div style="flex:1"><b>가진 옥</b><span>겨루기 3연승마다 하나씩</span></div>
        <b class="gem-count">${d.gems}</b>
      </div>

      <div class="section-h"><h3>옥으로 하는 것</h3><span>${d.uses.length}가지</span></div>
      <div class="grid">
        ${d.uses.map((u) => `
          <div class="card"><div class="card-body" style="display:flex;align-items:center;gap:12px">
            <div style="flex:1;min-width:0"><h4>${esc(u.name)}</h4><p>${esc(u.desc)}</p></div>
            <button class="btn ${d.gems >= u.gems ? 'red' : 'line'}" style="flex:none;height:36px;padding:0 13px;font-size:13px"
              data-gem-use="${u.key}" ${d.gems >= u.gems ? '' : 'disabled'}>옥 ${u.gems}</button>
          </div></div>`).join('')}
      </div>

      <div class="section-h"><h3>요금제</h3><span>준비 중</span></div>
      <div class="grid two">
        ${d.plans.map((p) => `
          <div class="card plan"><div class="card-body">
            <h4>옥 ${p.gems}${p.bonus ? ` <em class="plan-bonus">+${p.bonus}</em>` : ''}</h4>
            <p>${num(p.won)}원</p>
            <button class="btn line wide" style="margin-top:10px;height:36px;font-size:12.5px" data-act="gem-buy">준비 중</button>
          </div></div>`).join('')}
      </div>
      <p class="arena-note" style="margin-top:12px">${esc(d.notice)}</p>`;
  }

  /* ─────────────────────── 겨루기 랭킹 ─────────────────────── */

  function ranking(d) {
    if (!d.rows.length) return '<p class="arena-note">아직 겨룬 사람이 없습니다. 첫 판을 열어 보세요.</p>';
    const row = (r) => `
      <div class="rank-row ${r.isMe ? 'me' : ''} ${r.rank <= 3 ? 'top' : ''}">
        <span class="rank-no">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
        <span class="rank-av" style="background:${Util.avatarBg(r.avatarSeed)}">${esc(r.nickname[0])}</span>
        <div style="min-width:0;flex:1">
          <div class="rank-name">${esc(r.nickname)}${r.isMe ? '<em>나</em>' : ''} <em class="title-tag">${esc(r.title)}</em></div>
          <div class="rank-sub">${r.wins}승 ${r.losses}패 · 승률 ${r.winRate}% · ${esc(r.weapon)}${r.plus ? '+' + r.plus : ''}</div>
        </div>
        <span class="rank-pt">${num(r.rating)}</span>
      </div>`;
    return `
      ${d.rows.map(row).join('')}
      ${d.me && !d.rows.some((r) => r.isMe) ? `
        <div class="section-h"><h3>내 순위</h3><span>${d.total}명 중</span></div>${row(d.me)}` : ''}`;
  }

  window.BattleUI = { arena, fightStage, playFight, mine, forge, history, friends, gemShop, ranking };
})();
