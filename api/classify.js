export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  
  try {
    const body = req.body;
    const { 
      candidates = [], 
      historyByCategory = {}, 
      classifyRegion = false, 
      ourRegions = [] 
    } = body;
    
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: "candidates 배열이 필요합니다" });
    }
    
    // 후보 공고 목록 (사업분류 정보 포함)
    const numberedList = candidates.map((c, i) =>
      `${i+1}. [${c.org || '?'}] ${c.title || ''}${c.srvceDivNm ? ' (' + c.srvceDivNm + ')' : ''}`
    ).join('\n');
    
    // 사업이력 섹션 구성
    let historySection = '';
    const categories = ['연구컨설팅', '교육콘텐츠', '문화공간', '문화기획'];
    for (const cat of categories) {
      const items = historyByCategory[cat] || [];
      if (items.length > 0) {
        historySection += `\n[${cat}] (${items.length}건)\n`;
        const sample = items.slice(0, 20);
        historySection += sample.map(it => `- ${it.title}${it.desc ? ': ' + it.desc : ''}`).join('\n');
        if (items.length > 20) historySection += `\n... (외 ${items.length - 20}건)`;
        historySection += '\n';
      }
    }
    
    // 지역 분류 섹션 (옵션)
    let regionSection = '';
    let regionFormat = '';
    if (classifyRegion) {
      const ourRegionsText = (ourRegions || []).join(', ');
      regionSection = `
또한 각 사업의 "지역 범주"도 함께 판단해주세요:
- "우리": 발주 또는 사업 수행 지역이 ${ourRegionsText} 중 하나
- "전국": 중앙부처(문화체육관광부 등), 전국 단위 공공기관(한국문화예술위원회 등), 전국 단위 사업
- "타지역": 위에 해당하지 않는 다른 지역 (서울, 경기, 인천, 충청, 전라, 강원, 제주 등)
- "불명": 정보 부족으로 판단 불가
`;
      regionFormat = `, "region": "우리|전국|타지역|불명"`;
    }
    
    const systemPrompt = `당신은 "플랜비문화예술협동조합"의 사업 검토 보조원입니다.

플랜비는 부산 기반 문화·예술 분야 협동조합으로, 4개 사업 영역에서 활동합니다:
1) 연구컨설팅: 문화예술 정책 연구, 컨설팅, 학술용역
2) 교육콘텐츠: 교육 프로그램 개발, 교재 제작, 강의·워크숍
3) 문화공간: 공간 운영, 시설 기획, 공간 활용 프로그램
4) 문화기획: 문화예술 행사·전시·공연 기획, 축제 운영

플랜비의 과거 사업 이력 (카테고리별):
${historySection || '(이력 정보 없음)'}

당신의 역할:
1. 각 후보 공고가 위 4개 카테고리 중 어디에 해당하는지 판단 (복수 가능)
2. 플랜비가 이 사업을 수행할 수 있는지 적합도 점수 (0-10)
3. 1줄 추천 이유 (50자 이내)
${regionSection}

판단 기준:
- 위 사업 이력과 분야·성격·규모가 유사한지
- 단순 키워드보다 의미적 적합성
- 명확히 다른 분야(IT 시스템, 토목, 청소, 시설관리 등)는 0~3점
- 4개 카테고리 어디에도 명확히 속하지 않으면 categories를 빈 배열로

응답은 반드시 다음 JSON 형식으로만:
{
  "results": [
    {"n": 1, "score": 8, "categories": ["연구컨설팅"], "reason": "지역문화 정책 연구로 적합"${regionFormat}},
    {"n": 2, "score": 6, "categories": ["교육콘텐츠", "문화기획"], "reason": "예술교육 프로그램 기획"${regionFormat}}
  ]
}

- 모든 후보에 대해 빠짐없이 평가하세요
- categories는 위 4개 중 해당하는 것만 (1~3개)
- 마크다운, 설명, 인사 없이 JSON만`;

    const userMessage = `다음 ${candidates.length}건을 평가해주세요:\n\n${numberedList}`;
    
    const claudeResp = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8000,
          system: systemPrompt,
          messages: [
            { role: "user", content: userMessage }
          ]
        })
      }
    );
    
    const data = await claudeResp.json();
    
    // Claude API 자체 에러
    if (data.error) {
      return res.status(500).json(data);
    }
    
    const text = data.content?.[0]?.text || "";
    console.log("Claude 원문 (처음 300자):", text.substring(0, 300));
    
    // 코드블록 제거
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(500).json({
        error: "Claude JSON 파싱 실패",
        raw: text
      });
    }
    
    return res.status(200).json({
      success: true,
      parsed,
      usage: data.usage
    });
  } catch (e) {
    return res.status(500).json({
      error: e.message
    });
  }
}
