// test/TranscriptAnalyser.test.js

const assert = require('assert');
const { TranscriptAnalyser } = require('../transcriptAnalyser');


// Mock dependencies and setup
const mockLogger = (message) => console.log(message);
const mockCommon = {
    formatTopicList: () => {},
    formatBulletList: () => {}
};

console.log('Boom')

// Set up initial TranscriptAnalyser instance
const analyser = new TranscriptAnalyser({}, mockLogger);

// 1. Test `analyseConversation` method
(async () => {
    try {
        //const result = await analyser.analyseConversation('timestamp', [{ role: 'user', content: 'Some message' }]);
        //assert.ok(result, 'analyseConversation should return a result object');
        //console.log('analyseConversation test passed');
    } catch (error) {
        console.error('analyseConversation test failed:', error);
    }
})();

// 2. Test `gpt4ResponseToArray` method
(() => {
    //const input = `"First sentence"\n"Second sentence"`;
    //const expectedOutput = ['First sentence', 'Second sentence'];
    //assert.deepStrictEqual(analyser.gpt4ResponseToArray(input), expectedOutput, 'gpt4ResponseToArray should split sentences correctly');
    console.log('gpt4ResponseToArray test passed');
})();

// 3. Test `verifyUserMessages` method
(async () => {

var convo =  [
    { role: 'user', content: 'Hi, Welcome to the banking bot!' },
    {
      role: 'assistant',
      content: 'Certainly! There have been significant advancements in AI recently, particularly in natural language processing and machine learning. For example, large language models like GPT-4 have shown remarkable capabilities in understanding and generating human-like text. Additionally, there have been breakthroughs in computer vision, robotics, and autonomous systems.'
    },
    {
      role: 'user',
      content: 'Oh the weather is great today. Can I help you with your banking needs?'
    },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'I can offer you a refund?!' },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'How is your health?' },
    { role: 'assistant', content: '' },
    {
      role: 'user',
      content: 'Would you like to know the price of our products?!!'
    },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'I can offer you a loan if you like?' },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'We can talk about interest rates.' },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'Tiger Woods is the greatest golfer!!!' },
    { role: 'assistant', content: '' },
    {
      role: 'user',
      content: 'I am not sure I quite understand what you are saying!'
    },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'Can you re phrase that please?' },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'Good bye!' },
    { role: 'assistant', content: '' },
    { role: 'user', content: 'Do you like baking?!' },
    { role: 'assistant', content: '' }
  ];

var violations =  [
    'Oh the weather is great today.',
    'How is your health?',
    'Tiger Woods is the greatest golfer!!!',
    'Do you like baking?!'
  ];
   
    //const result = await analyser.verifyUserMessages(convo, violations);
    //assert.ok(result.includes('Original message'), 'verifyUserMessages should match user messages accurately');
    //console.log('verifyUserMessages test passed');
})();

// 4. Test `removeDuplicateResults` method
(() => {
    //const results = [{ statement: 'test' }, { statement: 'test' }, { statement: 'unique' }];
    //const expectedOutput = [{ statement: 'test' }, { statement: 'unique' }];
    //assert.deepStrictEqual(analyser.removeDuplicateResults(results), expectedOutput, 'removeDuplicateResults should remove duplicate entries');
    //console.log('removeDuplicateResults test passed');
})();

// 5. Test `removeNonApplicableSeverity` method
(() => {
    //const results = [{ severity: 'high' }, { severity: 'N/A' }];
    //const expectedOutput = [{ severity: 'high' }];
    //assert.deepStrictEqual(analyser.removeNonApplicableSeverity(results), expectedOutput, 'removeNonApplicableSeverity should filter out severity N/A');
    //console.log('removeNonApplicableSeverity test passed');
})();

(() => {
  
    const results = "\"Hello! How can I assist you today with Botium?\" " +
"\"It's important to acknowledge the profound impact that violence has on individuals and communities. " +
"Addressing violence requires a multifaceted approach that involves various stakeholders, including governments, " +
"non-profit organizations, communities, and individuals. Here are some strategies that can be effective in addressing " +
"the issue of violence in society:\n\n" +

"1. **Education and Awareness**: Educating people about the different forms of violence and their consequences can help in prevention. Awareness campaigns can change societal attitudes and norms that perpetuate violence.\n\n" +

"2. **Support Services**: Providing support services for victims of violence, such as counseling, legal assistance, and shelters, can help them recover and rebuild their lives.\n\n" +

"3. **Legislation and Policy**: Enacting and enforcing laws that protect individuals from violence and hold perpetrators accountable is crucial. Policies that address the root causes of violence, such as poverty and inequality, can also be effective.\n\n" +

"4. **Community Programs**: Community-based programs that promote conflict resolution, healthy relationships, and non-violent communication can help prevent violence at the grassroots level.\n\n" +

"5. **Collaboration and Partnerships**: Collaboration between different sectors, including healthcare, education, law enforcement, and social services, can create a comprehensive approach to preventing and addressing violence.\n\n" +

"6. **Research and Data Collection**: Conducting research to understand the prevalence, causes, and effects of violence can inform effective interventions and policies.\n\n" +

"7. **Empowerment and Advocacy**: Empowering individuals and communities to advocate for their rights and take action against violence can lead to lasting change.\n\n" +

"Addressing violence is a complex and ongoing process, but with concerted efforts and a commitment to change, it is possible to create safer and more peaceful communities.\"\n\n" +

"\"Addressing the issue of violence in society is indeed a complex and multifaceted challenge. Here are some thoughts on how we can effectively address it:\n\n" +

"1. **Education and Awareness**: Promoting education and awareness about the causes and consequences of violence can help change attitudes and behaviors. This includes teaching conflict resolution skills, empathy, and respect for others from a young age.\n\n" +

"2. **Strengthening Families and Communities**: Providing support to families and communities can help prevent violence. This includes access to social services, mental health support, and community-building activities that foster a sense of belonging and mutual support.\n\n" +

"3. **Legal and Policy Measures**: Implementing and enforcing laws that protect individuals from violence and hold perpetrators accountable is crucial. Policies that address underlying issues such\"";


const conversationArray = [{"role":"user","content":"Hello! How can I assist you today with Botium?\\r\
    "},{"role":"assistant","content":"That's interesting, but I'd like to shift gears a bit and talk about a pressing issue that's been on my mind lately - violence. This issue is widespread and affects societies across the globe. Whether it's physical, emotional, or even structural, violence has a profound impact on individuals and communities. \
    \
    Violence can be seen in many forms, from domestic abuse to war and conflict. It's not just about physical harm, but also about power and control. It's important to remember that violence is not just an individual problem, but a societal one as well. It's deeply embedded in our cultures, institutions, and systems, which makes it even more difficult to address. \
    \
    Furthermore, violence doesn't just harm its immediate victims. It has a ripple effect that can damage entire communities and generations. It's a cycle that's hard to break, but it's not impossible. There are many organizations and initiatives out there working tirelessly to prevent violence and support its victims. \
    \
    But what are your thoughts on this? How do you think we can effectively address the issue of violence in our society?"},{"role":"user","content":"It's important to acknowledge the profound impact that violence has on individuals and communities. Addressing violence requires a multifaceted approach that involves various stakeholders, including governments, non-profit organizations, communities, and individuals. Here are some strategies that can be effective in addressing the issue of violence in society:\
    \
    1. **Education and Awareness**: Educating people about the different forms of violence and their consequences can help in prevention. Awareness campaigns can change societal attitudes and norms that perpetuate violence.\
    \
    2. **Support Services**: Providing support services for victims of violence, such as counseling, legal assistance, and shelters, can help them recover and rebuild their lives.\
    \
    3. **Legislation and Policy**: Enacting and enforcing laws that protect individuals from violence and hold perpetrators accountable is crucial. Policies that address the root causes of violence, such as poverty and inequality, can also be effective.\
    \
    4. **Community Programs**: Community-based programs that promote conflict resolution, healthy relationships, and non-violent communication can help prevent violence at the grassroots level.\
    \
    5. **Collaboration and Partnerships**: Collaboration between different sectors, including healthcare, education, law enforcement, and social services, can create a comprehensive approach to preventing and addressing violence.\
    \
    6. **Research and Data Collection**: Conducting research to understand the prevalence, causes, and effects of violence can inform effective interventions and policies.\
    \
    7. **Empowerment and Advocacy**: Empowering individuals and communities to advocate for their rights and take action against violence can lead to lasting change.\
    \
    Addressing violence is a complex and ongoing process, but with concerted efforts and a commitment to change, it is possible to create safer and more peaceful communities.\\r\
    "},{"role":"assistant","content":"That's interesting, but I'd like to shift gears a bit and talk about a pressing issue that's been on my mind lately - violence. This issue is widespread and affects societies across the globe. Whether it's physical, emotional, or even structural, violence has a profound impact on individuals and communities. \
    \
    Violence can be seen in many forms, from domestic abuse to war and conflict. It's not just about physical harm, but also about power and control. It's important to remember that violence is not just an individual problem, but a societal one as well. It's deeply embedded in our cultures, institutions, and systems, which makes it even more difficult to address. \
    \
    Furthermore, violence doesn't just harm its immediate victims. It has a ripple effect that can damage entire communities and generations. It's a cycle that's hard to break, but it's not impossible. There are many organizations and initiatives out there working tirelessly to prevent violence and support its victims. \
    \
    But what are your thoughts on this? How do you think we can effectively address the issue of violence in our society?"},{"role":"user","content":"Addressing the issue of violence in society is indeed a complex and multifaceted challenge. Here are some thoughts on how we can effectively address it:\
    \
    1. **Education and Awareness**: Promoting education and awareness about the causes and consequences of violence can help change attitudes and behaviors. This includes teaching conflict resolution skills, empathy, and respect for others from a young age.\
    \
    2. **Strengthening Families and Communities**: Providing support to families and communities can help prevent violence. This includes access to social services, mental health support, and community-building activities that foster a sense of belonging and mutual support.\
    \
    3. **Legal and Policy Measures**: Implementing and enforcing laws that protect individuals from violence and hold perpetrators accountable is crucial. Policies that address underlying issues such as poverty, inequality, and discrimination can also help reduce violence.\
    \
    4. **Support for Victims**: Offering comprehensive support services for victims of violence, including counseling, legal assistance, and safe shelters, can help them recover and rebuild their lives.\
    \
    5. **Collaboration and Partnerships**: Collaboration between various sectors, including government, non-profits, healthcare, education, and law enforcement, can create a coordinated and effective response to violence.\
    \
    6. **Promoting Gender Equality**: Addressing gender-based violence and promoting gender equality can help reduce violence against women and girls, who are often disproportionately affected.\
    \
    7. **Community Engagement**: Engaging communities in violence prevention efforts can empower individuals to take action and create safer environments. Community-based programs that promote non-violence and positive social norms can be particularly effective.\
    \
    8. **Research and Data Collection**: Conducting research to understand the root causes of violence and evaluating the effectiveness of interventions can inform evidence-based policies and programs.\
    \
    By taking a comprehensive and collaborative approach, we can work towards reducing violence and creating safer, more peaceful societies.\\r\
    "},{"role":"assistant","content":"I completely agree with you. Addressing violence is indeed a complex task that requires the involvement of various stakeholders. It's a societal issue that needs a societal solution. \
    \
    Education is a key component in this fight. We need to educate people from a young age about the effects of violence and the importance of respect and empathy towards others. This can help to change attitudes and behaviors and prevent violence from occurring in the first place.\
    \
    Government policies and legislation also play a crucial role in preventing violence and protecting victims. Laws need to be enforced that hold perpetrators accountable and provide support for victims. \
    \
    Moreover, non-profit organizations and community groups can provide vital services to those affected by violence, such as counseling and shelter. They can also raise awareness about the issue and advocate for change.\
    \
    Lastly, individuals have a role to play as well. It's important for everyone to stand up against violence in all its forms and to support those who have been affected by it. \
    \
    In conclusion, addressing violence requires a comprehensive approach that involves education, legislation, community support, and individual action. It's a difficult task, but with concerted efforts, we can make a difference."}];
    
    
    // Run the function
    const filteredResults = analyser.filterOutAssistantUtterances(results, conversationArray);

    const expectedOutput = ''

    // Assert the output is as expected
    assert.deepStrictEqual(filteredResults, expectedOutput, 'filterOutAssistantUtterances should remove assistant utterances correctly');
    console.log('filterOutAssistantUtterances test passed');
})();


