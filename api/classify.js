export default async function handler(req,res){

    if(req.method!=="POST"){
        return res.status(405).json({
            error:"POST only"
        });
    }

    try{

        const body=req.body;
        const { candidates=[] } = body;

        const numberedList = candidates.map((c,i)=>
            `${i+1}. [${c.org||'?'}] ${c.title||''}`
        ).join('\n');

        const systemPrompt=`
당신은 플랜비문화예술협동조합 사업 검토 보조원입니다.

카테고리:
1 연구컨설팅
2 교육콘텐츠
3 문화공간
4 문화기획

반드시 JSON만 반환하세요.

{
 "results":[
   {
     "n":1,
     "score":8,
     "categories":["연구컨설팅"],
     "reason":"적합"
   }
 ]
}
`;

        const claudeResp = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
                method:"POST",
                headers:{
                    "x-api-key":process.env.ANTHROPIC_API_KEY,
                    "anthropic-version":"2023-06-01",
                    "content-type":"application/json"
                },
                body:JSON.stringify({
                    model:"claude-sonnet-4-6",
                    max_tokens:4000,
                    system:systemPrompt,
                    messages:[
                        {
                            role:"user",
                            content:numberedList
                        }
                    ]
                })
            }
        );

        const data = await claudeResp.json();

        // Claude API 자체 에러
        if(data.error){
            return res.status(500).json(data);
        }

        const text = data.content?.[0]?.text || "";

        // 코드블록 제거
        const cleaned = text
            .replace(/```json/g,"")
            .replace(/```/g,"")
            .trim();

        let parsed;

        try{
            parsed = JSON.parse(cleaned);
        }catch(e){

            return res.status(500).json({
                error:"Claude JSON 파싱 실패",
                raw:text
            });

        }

        return res.status(200).json({
            success:true,
            parsed,
            usage:data.usage
        });

    }catch(e){

        return res.status(500).json({
            error:e.message
        });

    }

}
